import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { db } from '@/data';
import type { ConsumeLog, ConsumeType, Item } from '@/domain/types';
import { newId } from '@/domain/ids';
import { todayStr } from '@/domain/dates';
import { createItem, recomputeForLocation, type NewItemInput } from '@/domain/itemFactory';
import { fallbackDays } from '@/domain/categories';
import { lookupFood } from '@/data/dict';
import { snoozeUntilOf } from '@/domain/todo';
import { planBulkConsume, planBulkMove, planBulkRemove, type BulkOp } from '@/domain/bulk';
import { useDictStore } from './dict';
import { useLocationsStore } from './locations';

/** 数量保留 2 位小数：0.5 斤这类输入参与加减后不会留下 0.30000000000000004 */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export const useItemsStore = defineStore('items', () => {
  const list = ref<Item[]>([]);
  const logs = ref<ConsumeLog[]>([]);
  const loaded = ref(false);

  const active = computed(() => list.value.filter((i) => !i.deletedAt && i.status === 'in_stock'));

  /** 全量重读商品与日志到本地状态（写操作内部都会调用） */
  async function load() {
    const [items, ls] = await Promise.all([db.items.all(), db.logs.all()]);
    list.value = items;
    logs.value = ls;
    loaded.value = true;
  }

  /** 同步按 id 查找商品（已过滤软删除）；找不到返回 undefined */
  function byId(id: string): Item | undefined {
    return list.value.find((i) => i.id === id && !i.deletedAt);
  }

  /**
   * 新建商品并落库。到期日由 `domain/itemFactory.createItem` 推算：
   * 品类从内置字典取，环境由 `locationId` 查得，随后走四级兜底。
   *
   * @param input 用户输入（名称 / 数量 / 单位 / 位置，其余可选）
   * @returns 落库后的完整 Item（含自动生成的 id 与 expireAt）
   * @example await items.add({ name: '牛奶', quantity: 2, unit: '盒', locationId: fridgeId })
   */
  async function add(input: NewItemInput): Promise<Item> {
    const dict = useDictStore();
    const locs = useLocationsStore();
    const category = lookupFood(input.name)?.category ?? null;
    const item = createItem(input, locs.envOf(input.locationId), dict.resolve, fallbackDays, Date.now(), category);
    await db.items.put(item);
    await load();
    return item;
  }

  /**
   * 批量新建商品。
   *
   * ⚠️ 为什么必须有这条路径：`add()` 内部每次都 `await load()`（全量重读 items + logs），
   * 批量入库 20 件就会触发 20 次全表读。这里一次 `bulkPut` + 一次 `load` 搞定。
   *
   * 品类解析与单个 `add()` 完全一致（`lookupFood(name)?.category ?? null`），
   * 否则批量入库的卡片图标/品类会和单个入库对不上。
   *
   * @returns 落库后的完整 Item 列表，顺序与 `inputs` 一致
   */
  async function addMany(inputs: NewItemInput[]): Promise<Item[]> {
    if (!inputs.length) return [];
    const dict = useDictStore();
    const locs = useLocationsStore();
    const now = Date.now();
    const rows = inputs.map((input) =>
      createItem(input, locs.envOf(input.locationId), dict.resolve, fallbackDays, now, lookupFood(input.name)?.category ?? null),
    );
    await db.items.bulkPut(rows);
    await load();
    return rows;
  }

  /**
   * 整条覆盖写入商品，并刷新 `updatedAt`。
   * ⚠️ 是 put 而非 patch：传入的对象缺失的字段会被写成上一次的值（调用方通常传展开后的完整 Item）。
   */
  async function save(item: Item) {
    await db.items.put({ ...item, updatedAt: Date.now() });
    await load();
  }

  /**
   * 切换位置后重算到期日，**入库日期 `storedAt` 保持不变**。
   * 商品不存在时静默返回（不抛错）。
   * @example await items.moveTo(id, pantryId)
   */
  async function moveTo(id: string, locationId: string) {
    const dict = useDictStore();
    const locs = useLocationsStore();
    const cur = byId(id);
    if (!cur) return;
    const patch = recomputeForLocation(cur, locs.envOf(locationId), dict.resolve, fallbackDays);
    await db.items.put({ ...cur, ...patch, locationId, updatedAt: Date.now() });
    await load();
  }

  /**
   * 设置或清除手填保质期并重算到期日。手填天数优先级最高，后续切位置也不会被字典覆盖。
   * @param days 天数；传 `null` 或 ≤ 0 表示关闭手填，回落自动推算。
   * @example await items.setManualShelfLife(id, 30)
   */
  async function setManualShelfLife(id: string, days: number | null) {
    const dict = useDictStore();
    const locs = useLocationsStore();
    const cur = byId(id);
    if (!cur) return;
    const next = { ...cur, manualShelfLife: days && days > 0 ? days : null };
    const patch = recomputeForLocation(next, locs.envOf(cur.locationId), dict.resolve, fallbackDays);
    await db.items.put({ ...next, ...patch, updatedAt: Date.now() });
    await load();
  }

  /**
   * 「明天再说」：把物品延后 N 天不处理。
   *
   * 只写 `snoozeUntil`，**不动 `expireAt`** —— 它表示「我今天不想处理它」，
   * 不是「它变新鲜了」。延后仅影响今日待办列表与提醒推送。
   *
   * @param days 延后天数，默认 1；传 0 或负数 = 立即取消延后
   */
  async function snooze(id: string, days = 1) {
    const cur = byId(id);
    if (!cur) return;
    await db.items.put({ ...cur, snoozeUntil: snoozeUntilOf(cur, days), updatedAt: Date.now() });
    await load();
  }

  /** 取消延后，立即回到今日待办 */
  async function unsnooze(id: string) {
    const cur = byId(id);
    if (!cur) return;
    await db.items.put({ ...cur, snoozeUntil: null, updatedAt: Date.now() });
    await load();
  }

  /**
   * 消耗商品，**支持部分消耗**（如「一次买了 20 个鸡蛋，这次只用 2 个」）。
   *
   * @param type `'consumed'` 用掉了 / `'wasted'` 扔掉了。后者会计入「本月浪费金额」。
   * @param qty 本次消耗数量，**缺省 = 全部用完**（保持「一键清空」的手感）。
   *            取值会被钳到 `(0, 剩余数量]`：给多了按剩余算，给 0 / 负数直接不写日志。
   * @returns 新写入的日志 id，可传给 `undoConsume()` 撤销；商品不存在或 qty 非法时返回 `''`。
   * @remarks
   * - **数量不足时不改状态**：`quantity` 扣减后商品仍是 `in_stock`，继续留在库存里；
   *   只有 `qty >= 剩余数量` 才置 `'finished'`（此时 `quantity` 保留原值不归零，供日志对账）。
   * - 日志的 `price` 记的是**本次金额**（`单价 × 消耗数量`）——`Item.price` 的语义是单价。
   * @example
   * await items.consume(eggId, 'consumed', 2);  // 20 → 18，仍在库
   * await items.consume(eggId, 'wasted');       // 剩下的全扔掉
   */
  async function consume(id: string, type: ConsumeType, qty?: number): Promise<string> {
    const cur = byId(id);
    if (!cur) return '';
    const remain = cur.quantity;
    const take = Math.min(remain, qty === undefined ? remain : round2(qty));
    if (take <= 0) return '';

    const now = Date.now();
    const today = todayStr(now);
    let overdueDays: number | null = null;
    if (cur.expireAt) {
      const d = Math.round((new Date(`${cur.expireAt}T00:00:00`).getTime() - new Date(`${today}T00:00:00`).getTime()) / 86400000);
      overdueDays = d < 0 ? -d : 0;
    }
    const log: ConsumeLog = {
      id: newId(),
      itemId: cur.id,
      name: cur.name,
      quantity: take,
      unit: cur.unit,
      locationId: cur.locationId,
      type,
      // Item.price 是单价，日志要记本次金额，否则「扔掉 2 个」会记成整份的钱
      price: cur.price === null ? null : round2(cur.price * take),
      // 单价快照：明细「单价」列用；与上面的「金额」是两个维度，别混
      unitPrice: cur.price === null ? null : cur.price,
      // 备注快照：明细「备注」列用。item.note 之后可能改，消耗时定格一份
      note: cur.note ?? null,
      expireAt: cur.expireAt,
      overdueDays,
      at: now,
      createdAt: now,
      deletedAt: null,
    };
    await db.logs.put(log);
    if (take >= remain) {
      await db.items.put({ ...cur, status: 'finished', updatedAt: now });
    } else {
      await db.items.put({ ...cur, quantity: round2(remain - take), updatedAt: now });
    }
    await load();
    return log.id;
  }

  /**
   * 撤销一次消耗：删掉那条日志，把商品状态改回 `'in_stock'`，**并把数量加回去**。
   * 供 toast 的「撤销」按钮使用；日志已不存在时静默返回。
   *
   * @param logId `consume()` 返回的日志 id
   * @remarks
   * 整条消耗时 `quantity` 并未被扣减（仍是原值），只有**部分消耗**需要回加；
   * 靠 `status` 判断：撤销时若商品仍是 `in_stock`，说明当初是部分消耗。
   * @example await items.undoConsume(logId)
   */
  async function undoConsume(logId: string) {
    const log = logs.value.find((l) => l.id === logId);
    if (!log) return;
    const cur = list.value.find((i) => i.id === log.itemId);
    if (cur) {
      const addBack = cur.status === 'in_stock' ? log.quantity : 0;
      await db.items.put({
        ...cur,
        status: 'in_stock',
        quantity: addBack ? round2(cur.quantity + addBack) : cur.quantity,
        updatedAt: Date.now(),
      });
    }
    await db.logs.hardDelete(logId);
    await load();
  }

  /**
   * 软删除商品（不写消耗日志）。用于「手滑加错了」的场景，
   * 与 `consume` 的区别是不影响统计。
   *
   * @returns 删除前的商品快照；把它传给 `restore()` 即可撤销。
   * @remarks `db.items.all()` 会过滤掉 `deletedAt` 非空的行，所以撤销必须靠这份快照，查不回来了。
   * @example const snap = await items.remove(id);
   */
  async function remove(id: string): Promise<Item | undefined> {
    const cur = byId(id);
    await db.items.softDelete(id);
    await load();
    return cur;
  }

  /**
   * 撤销软删除：把 `deletedAt` 置回 `null` 后整条写回。
   *
   * @param snapshot `remove()` 返回的快照
   * @example await items.restore(snap)
   */
  async function restore(snapshot: Item) {
    await db.items.put({ ...snapshot, deletedAt: null, updatedAt: Date.now() });
    await load();
  }

  /**
   * 用当前字典**重算所有在库商品**的到期日并批量落库。
   * 用户在字典页改了保质期后必须调用，否则已有商品仍是旧的天数快照。
   * 历史日志与已消耗的成品不会被改写。
   * @example await items.recomputeAll()
   */
  async function recomputeAll() {
    const dict = useDictStore();
    const locs = useLocationsStore();
    const now = Date.now();
    const updated = active.value.map((i) => ({
      ...i,
      ...recomputeForLocation(i, locs.envOf(i.locationId), dict.resolve, fallbackDays),
      updatedAt: now,
    }));
    if (updated.length) await db.items.bulkPut(updated);
    await load();
  }

  /* ==================== 批量操作 ==================== */

  /**
   * 批量操作的撤销快照表。
   *
   * 只存内存、不落库：撤销入口只在 Toast 上存在 5 秒，为它建表不值得；
   * 刷新页面后撤销失效是可接受的代价。
   *
   * 同时限制长度上限（`BULK_OP_KEEP`），避免长时间使用后无界增长。
   */
  const bulkOps = new Map<string, BulkOp>();
  const BULK_OP_KEEP = 20;

  function remember(op: BulkOp): BulkOp {
    bulkOps.set(op.id, op);
    while (bulkOps.size > BULK_OP_KEEP) {
      const oldest = bulkOps.keys().next().value;
      if (oldest === undefined) break;
      bulkOps.delete(oldest);
    }
    return op;
  }

  /** 把 id 列表解析成在库商品对象；已删除/已用完的直接排除 */
  function pickActive(ids: string[]): Item[] {
    const set = new Set(ids);
    return list.value.filter((i) => set.has(i.id) && !i.deletedAt && i.status === 'in_stock');
  }

  /**
   * 批量消耗：每件各自清空剩余量。
   *
   * @returns 供 toast 撤销的 `BulkOp`；无可操作项时返回 `null`
   */
  async function bulkConsume(ids: string[], type: ConsumeType): Promise<BulkOp | null> {
    const targets = pickActive(ids);
    if (!targets.length) return null;
    const now = Date.now();
    const before = targets.map((i) => ({ ...i }));
    const plan = planBulkConsume(targets, type, now);
    await db.transaction(async () => {
      await db.logs.bulkPut(plan.logs);
      await db.items.bulkPut(plan.items);
    });
    await load();
    return remember({
      id: newId(),
      kind: 'consume',
      consumeType: type,
      items: before,
      logIds: plan.logs.map((l) => l.id),
      createdAt: now,
    });
  }

  /** 批量换位置：按新位置重算到期日（手填保质期优先级不变） */
  async function bulkMoveTo(ids: string[], locationId: string): Promise<BulkOp | null> {
    const dict = useDictStore();
    const locs = useLocationsStore();
    const targets = pickActive(ids);
    if (!targets.length) return null;
    const now = Date.now();
    const before = targets.map((i) => ({ ...i }));
    const next = planBulkMove(targets, locationId, locs.envOf(locationId), dict.resolve, fallbackDays, now);
    await db.items.bulkPut(next);
    await load();
    return remember({ id: newId(), kind: 'move', items: before, logIds: [], createdAt: now });
  }

  /** 批量删除：软删除且**不写消耗日志**（与逐条 `remove` 语义一致，不污染统计） */
  async function bulkRemove(ids: string[]): Promise<BulkOp | null> {
    const set = new Set(ids);
    const targets = list.value.filter((i) => set.has(i.id) && !i.deletedAt);
    if (!targets.length) return null;
    const now = Date.now();
    const before = targets.map((i) => ({ ...i }));
    await db.items.bulkPut(planBulkRemove(targets, now));
    await load();
    return remember({ id: newId(), kind: 'remove', items: before, logIds: [], createdAt: now });
  }

  /**
   * 撤销一次批量操作。
   *
   * ⚠️ 顺序要紧：**先硬删日志，再写回商品快照**。反了会留下
   * 「商品状态是 in_stock、日志却记着已消耗」的脏账，统计页会对不上。
   */
  async function undoBulk(op: BulkOp | null | undefined) {
    if (!op) return;
    const items = op.items.map((i) => ({ ...i, deletedAt: null, updatedAt: Date.now() }));
    await db.transaction(async () => {
      for (const id of op.logIds) await db.logs.hardDelete(id);
      await db.items.bulkPut(items);
    });
    bulkOps.delete(op.id);
    await load();
  }

  return {
    list, logs, loaded, active, load, byId, add, addMany, save, moveTo, setManualShelfLife,
    snooze, unsnooze, consume, undoConsume, remove, restore, recomputeAll,
    bulkConsume, bulkMoveTo, bulkRemove, undoBulk,
  };
});
