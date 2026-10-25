import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { db } from '@/data';
import type { Item, ShoppingItem } from '@/domain/types';
import { newId } from '@/domain/ids';
import { planShopping, DISMISS_DAYS, type Suggestion } from '@/domain/shoppingRules';
import { inboundInputs } from '@/domain/inbound';
import { manualDaysForExpiry } from '@/domain/shelfLife';
import { todayStr } from '@/domain/dates';
import { foodKeyOf } from '@/data/dict';
import { useItemsStore } from './items';
import { useLocationsStore } from './locations';
import { useSettingsStore } from './settings';

/** 抑制时长只允许由 `DISMISS_DAYS` 换算而来（单一数值来源，别再写一个 7） */
const DISMISS_MS = DISMISS_DAYS * 24 * 60 * 60 * 1000;

export const useShoppingStore = defineStore('shopping', () => {
  const list = ref<ShoppingItem[]>([]);
  const loaded = ref(false);

  const visible = computed(() => list.value.filter((s) => !s.deletedAt));
  const pending = computed(() => visible.value.filter((s) => !s.checked));
  const done = computed(() => visible.value.filter((s) => s.checked));

  async function load() {
    list.value = await db.shopping.all();
    loaded.value = true;
  }

  /**
   * 根据商品与消耗日志自动生成购物建议并落库。
   *
   * **幂等**：同一 `name|reason` 不会重复生成，且被删除的自动项在 `DISMISS_DAYS`（7 天）内
   * 不会重生（`domain/shoppingRules.planShopping` 保证），所以可以安全地每次启动都调用。
   *
   * ⚠️ 喂给 `planShopping` 的必须是 `allIncludingDeleted()`（含软删除行）：抑制依据住在
   * 软删除行里。此前传 `list.value`（`all()` 已滤软删），dismissed 集合恒为空，
   * 「忽略牛奶建议」后下次启动又冒出来（REV-43）。
   *
   * @returns 本次新增条数；`0` 表示没有新建议。
   * @remarks 依赖 `items`、`settings` store 已加载，否则结果为空。
   * @example const n = await shopping.generate();
   */
  async function generate(): Promise<number> {
    const items = useItemsStore();
    const settings = useSettingsStore();
    const existing = await db.shopping.allIncludingDeleted();
    const suggestions: Suggestion[] = planShopping(items.list, items.logs, existing, Date.now(), settings.settings);
    if (!suggestions.length) return 0;
    const now = Date.now();
    const rows: ShoppingItem[] = suggestions.map((s) => ({
      id: newId(),
      name: s.name,
      quantity: s.quantity,
      unit: s.unit,
      locationId: s.locationId,
      reason: s.reason,
      sourceItemId: s.sourceItemId,
      checked: false,
      checkedAt: null,
      auto: true,
      dismissedUntil: null,
      inboundItemId: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    }));
    await db.shopping.bulkPut(rows);
    await load();
    return rows.length;
  }

  async function toggle(id: string) {
    const cur = list.value.find((s) => s.id === id);
    if (!cur) return;
    await db.shopping.put({ ...cur, checked: !cur.checked, checkedAt: cur.checked ? null : Date.now(), updatedAt: Date.now() });
    await load();
  }

  /** 手动添加一条清单项。`name` trim 后为空则静默返回（不报提示）。 */
  async function addManual(name: string, unit: string | null = null) {
    const now = Date.now();
    const n = name.trim();
    if (!n) return;
    await db.shopping.put({
      id: newId(),
      name: n,
      quantity: null,
      unit: unit ? unit.trim() || null : null,
      locationId: null,
      reason: 'manual',
      sourceItemId: null,
      checked: false,
      checkedAt: null,
      auto: false,
      dismissedUntil: null,
      inboundItemId: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });
    await load();
  }

  /**
   * 删除一条清单项，行为按来源分岔：
   * - **自动项**（`auto: true`）：软删除并设置 `dismissedUntil = now + 7 天`，7 天内不会被重新生成；
   * - **手动项**（`auto: false`）：直接软删除。
   *
   * ⚠️ 「删除自动建议」不等于永久忽略：7 天后若规则仍命中会再次出现。这是设计意图。
   *
   * @returns 删除前的清单项快照，传给 `restore()` 即可撤销。
   *   `db.shopping.all()` 会过滤掉 `deletedAt` 非空的行，删完就查不回来了，只能靠这份快照。
   */
  async function remove(id: string): Promise<ShoppingItem | undefined> {
    const cur = list.value.find((s) => s.id === id);
    if (!cur) return undefined;
    if (cur.auto) {
      await db.shopping.put({ ...cur, deletedAt: Date.now(), dismissedUntil: Date.now() + DISMISS_MS, updatedAt: Date.now() });
    } else {
      await db.shopping.softDelete(id);
    }
    await load();
    return cur;
  }

  /** 撤销删除：清掉 `deletedAt` 与 `dismissedUntil` 后整条写回 */
  async function restore(snapshot: ShoppingItem) {
    await db.shopping.put({ ...snapshot, deletedAt: null, dismissedUntil: null, updatedAt: Date.now() });
    await load();
  }

  /**
   * 批量撤销删除（`clearDone` 的撤销入口）：一次 `bulkPut` + 一次 `load`。
   * 逐条 `restore` 会触发 N 次全量重读，勾了十几件时肉眼可见地卡。
   */
  async function restoreMany(snapshots: ShoppingItem[]) {
    if (!snapshots.length) return;
    const now = Date.now();
    await db.shopping.bulkPut(snapshots.map((s) => ({ ...s, deletedAt: null, dismissedUntil: null, updatedAt: now })));
    await load();
  }

  /**
   * 清除所有已勾选项（软删除 + `dismissedUntil`，同自动项的删除策略）。未勾选项不受影响。
   *
   * - **一次 `bulkPut` 写完**：此前逐条 `await put`，中途失败会清一半留一半（REV-19）；
   * - 返回删除前的快照供 toast「撤销」（`restoreMany` 整批回滚）。
   */
  async function clearDone(): Promise<ShoppingItem[]> {
    const targets = done.value.map((s) => ({ ...s }));
    if (!targets.length) return [];
    const now = Date.now();
    await db.shopping.bulkPut(
      targets.map((s) => ({ ...s, deletedAt: now, dismissedUntil: now + DISMISS_MS, updatedAt: now })),
    );
    await load();
    return targets;
  }

  /* ==================== 一键入库 ==================== */

  /** 写入入库结果：勾选 + 记下生成的物品 id，供「撤销入库」反查 */
  async function markInbound(id: string, itemId: string) {
    const cur = list.value.find((s) => s.id === id);
    if (!cur) return;
    const now = Date.now();
    await db.shopping.put({ ...cur, checked: true, checkedAt: now, inboundItemId: itemId, updatedAt: now });
  }

  /**
   * 单项入库：把一条清单项变成库存里的物品。
   *
   * 走 `items.addMany`（一次 bulkPut）而不是循环 `add()`，后者每次都会全量重读。
   *
   * @param expiry 用户指定的到期日（v1.1 F17，null = 自动推算）；换算为手填保质期天数
   *               （基准是入库日 = 今天）挂到新建物品上，换位置也不会被字典覆盖。
   * @returns 新建的物品；清单项已不存在时返回 `null`
   */
  async function inboundOne(
    id: string,
    quantity: number,
    locationId: string,
    price: number | null = null,
    expiry: string | null = null,
  ): Promise<Item | null> {
    const items = useItemsStore();
    const locs = useLocationsStore();
    const s = list.value.find((x) => x.id === id && !x.deletedAt);
    if (!s) return null;
    // ⚠️ 已入库的项短路：避免 await 期间连点「入库」按钮导致重复创建物品
    if (s.inboundItemId) return null;
    // 传别名解析器：「西红柿」也能命中历史里的「番茄」，否则每次都要手选位置
    const { rows } = inboundInputs([s], items.list, locs.all, {
      aliasKey: foodKeyOf,
      // 用户这次实际填的价格优先于「上次同名称的单价」
      overrides: new Map([[s.id, { quantity, locationId, price }]]),
    });
    if (!rows.length) return null;
    // v1.1 F17：指定到期日 → 手填保质期天数（快速入库同口径）
    if (expiry) rows[0].input.manualShelfLife = manualDaysForExpiry(expiry, todayStr(Date.now())) ?? undefined;
    const created = await items.addMany([rows[0].input]);
    const item = created[0];
    if (item) await markInbound(id, item.id);
    // ⚠️ 必须刷新 shopping.list：markInbound 只写 DB 不刷内存，
    // 不刷新则 ListView 的 v-if="s.inboundItemId" 不命中、
    // 「入库」按钮仍可点，连点会产生孤儿物品记录
    await load();
    return item ?? null;
  }

  /**
   * 批量入库：把若干清单项一次性变成库存物品。
   *
   * ⚠️ 不用 `db.transaction` 包住「写物品 + 回写清单」：Dextr 事务会锁住相关表，
   * 而 `items.addMany` 内部需要 `load()` 全量重读，放进事务里容易与事务外的读冲突。
   * 这里改成「先落物品、再回写清单项」两步 —— 中途失败最坏结果是清单项没勾上，
   * 物品已入库（数据只多不少，不会丢），比事务回滚更安全。
   *
   * @param ids 要入库的清单项 id
   * @param overrides 逐项覆盖数量/位置；缺省时按 `domain/inbound` 推断
   * @returns 入库成功的数量、未能入库的清单项
   */
  async function inboundAll(
    ids: string[],
    overrides?: Map<string, { quantity: number; locationId: string }>,
  ): Promise<{ count: number; skipped: ShoppingItem[] }> {
    const items = useItemsStore();
    const locs = useLocationsStore();
    const set = new Set(ids);
    const targets = list.value.filter((s) => set.has(s.id) && !s.deletedAt);
    if (!targets.length) return { count: 0, skipped: [] };

    const { rows, skipped } = inboundInputs(targets, items.list, locs.all, { overrides, aliasKey: foodKeyOf });
    if (!rows.length) return { count: 0, skipped };

    // ⚠️ `merge: false`：清单里两行同名（自动临期 + 手动）若合并成一条记录，
    // 两行会共享同一个 `inboundItemId`，而 `undoInbound` 是按「1 行 = 1 物品」回滚的
    // → 撤销一行再入库会把数量算成双份。一条 input = 一条批次记录，与 §5.6 一致。
    const created = await items.addMany(rows.map((r) => r.input), { merge: false });
    for (let i = 0; i < rows.length; i++) {
      const item = created[i];
      if (item) await markInbound(rows[i].shoppingId, item.id);
    }
    // ⚠️ 同 inboundOne：markInbound 只写 DB 不刷内存，
    // 不刷新则「全部入库」按钮仍可见，连点会再创建一批孤儿物品
    await load();
    return { count: created.length, skipped };
  }

  /**
   * 撤销入库：删掉入库时生成的物品，并把清单项恢复成「未入库」。
   *
   * @param id 清单项 id
   * @returns 被删掉的物品快照，交给 `items.restore()` 才能真正撤销
   */
  async function undoInbound(id: string): Promise<Item | undefined> {
    const items = useItemsStore();
    const s = list.value.find((x) => x.id === id);
    if (!s) return undefined;
    const itemId = s.inboundItemId ?? null;
    const snapshot = itemId ? items.byId(itemId) : undefined;
    if (itemId) await items.remove(itemId);
    const now = Date.now();
    await db.shopping.put({ ...s, checked: false, checkedAt: null, inboundItemId: null, updatedAt: now });
    await load();
    return snapshot;
  }

  return {
    list, loaded, visible, pending, done, load, generate, toggle, addManual, remove, restore, restoreMany, clearDone,
    inboundOne, inboundAll, undoInbound,
  };
});
