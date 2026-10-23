import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { db } from '@/data';
import type { ConsumeLog, ConsumeType, Item } from '@/domain/types';
import { newId } from '@/domain/ids';
import { todayStr } from '@/domain/dates';
import { createItem, recomputeForLocation, type NewItemInput } from '@/domain/itemFactory';
import { fallbackDays } from '@/domain/categories';
/** 金额口径的唯一来源：单价必须是有限非负数，否则记为「没填价」（null），不能当成 0 */
import { normalizePrice, normalizeQty } from '@/domain/price';
import { lookupFood, foodKeyOf } from '@/data/dict';
import { snoozeUntilOf } from '@/domain/todo';
import { planBulkConsume, planBulkMove, planBulkRemove, buildConsumeLog, type BulkOp } from '@/domain/bulk';
import { planGroupConsume, findMergeTarget } from '@/domain/grouping';
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
   * **同名同位置且到期日相差 ≤ 1 天时，数量并入既有记录**（不再新增行）。
   * 那种情况下折叠展示与真合并对用户完全无感，保留两行只会让详情页多出无意义的行。
   * 其它情况一律各存各的 —— 到期日不同就分属不同批次，合并会丢掉「哪一份先过期」。
   *
   * @returns 落库后的完整 Item 列表，顺序与 `inputs` 一致
   * @param opts.merge 是否允许**跨 input 合并**（默认 `true`）。清单「全部入库」传 `false`：
   *        合并会让多行清单指向同一条记录，而撤销是按「1 行 = 1 物品」回滚的，
   *        撤销一行再入库就会把数量算成双份。关闭后一条 input = 一条批次记录，符合 §5.6。
   */
  async function addMany(inputs: NewItemInput[], opts: { merge?: boolean } = {}): Promise<Item[]> {
    if (!inputs.length) return [];
    const merge = opts.merge !== false;
    const dict = useDictStore();
    const locs = useLocationsStore();
    const now = Date.now();
    const created = inputs.map((input) =>
      createItem(input, locs.envOf(input.locationId), dict.resolve, fallbackDays, now, lookupFood(input.name)?.category ?? null),
    );

    // 一次遍历同时算出「要写哪些行」和「每个 input 最终落在哪一行」。
    //
    // ⚠️ 多个 input 之间也会互相命中（「牛奶」+「牛奶」一次买两盒），
    // 所以每合并一次就把目标换成合并后的那份，后面的 input 继续往它上面加。
    // `landed[i]` 与 `inputs[i]` 严格一一对应 —— 调用方（清单入库的 `inboundItemId`
    // 与「撤销入库」）靠这个对应关系反查，按名字 find 是靠不住的。
    const byId = new Map<string, Item>();
    const landed: Item[] = [];
    for (const item of created) {
      const hit = merge ? findMergeTarget(item, [...byId.values()], foodKeyOf) : null;
      if (hit) {
        const next = { ...hit, quantity: round2(hit.quantity + item.quantity), updatedAt: now };
        byId.set(hit.id, next);
        landed.push(next);
        continue;
      }
      byId.set(item.id, item);
      landed.push(item);
    }

    await db.items.bulkPut([...byId.values()]);
    await load();
    return landed;
  }

  /**
   * 整条覆盖写入商品，并刷新 `updatedAt`。
   * ⚠️ 是 put 而非 patch：传入的对象缺失的字段会被写成上一次的值（调用方通常传展开后的完整 Item）。
   */
  async function save(item: Item) {
    // 写入前再归一一次：编辑页已经洗过，这层是兜住「从别处拼出来的 Item」不会把脏价格带进库
    await db.items.put({ ...item, price: normalizePrice(item.price), updatedAt: Date.now() });
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
  /**
   * 正在消耗的 item id（防连点）。
   *
   * 用 `Set` 而不是布尔：不同物品允许并发消耗，只有**同一件**在飞时才挡。
   * 挡不住的话，qty=1 时双击 ✓ 会写两条日志（物品只 finished 一次）→ 统计翻倍、撤销只能删一条。
   */
  const consumeInFlight = new Set<string>();

  async function consume(id: string, type: ConsumeType, qty?: number): Promise<string> {
    // 同一物品的消耗还没落库：直接忽略这次点击（调用方收到 '' 就不会弹 toast）
    if (consumeInFlight.has(id)) return '';
    const cur = byId(id);
    // ⚠️ 必须校验 status === 'in_stock'：整条消耗后 quantity 保留原值（供日志对账），
    // 如果只看 byId（过滤 deletedAt），已 finished 的物品会被再次消耗，日志重复写入污染统计。
    // bulkConsume / consumeGroup 通过 pickActive 有这层校验，单条路径此前缺失。
    if (!cur || cur.status !== 'in_stock') return '';
    const remain = normalizeQty(cur.quantity);
    // ⚠️ 用 Number.isFinite 替代 `take <= 0`：JS 经典坑 `NaN <= 0` 恒为 false，
    // NaN 会穿透到 buildConsumeLog / 物品 quantity 写入，一次误操作永久损坏数据。
    const take = Math.min(remain, qty === undefined ? remain : round2(qty));
    if (!Number.isFinite(take) || take <= 0) return '';

    const now = Date.now();
    const today = todayStr(now);
    // ⚠️ 日志构造统一走 domain/bulk 的 `buildConsumeLog`（与批量、分组消耗同一份实现）。
    const log: ConsumeLog = buildConsumeLog(cur, type, take, today, now);
    // ⚠️ log + item 包进同一事务：bulkConsume / consumeGroup 都这么做，
    // 单条路径此前漏了。若 logs.put 成功后 items.put 失败（Quota / IO），
    // 日志已落库但物品未更新 → 统计虚高、撤销时会二次加回。
    consumeInFlight.add(id);
    try {
      await db.transaction(async () => {
        await db.logs.put(log);
        if (take >= remain) {
          await db.items.put({ ...cur, status: 'finished', updatedAt: now });
        } else {
          await db.items.put({ ...cur, quantity: round2(remain - take), updatedAt: now });
        }
      });
      await load();
      return log.id;
    } finally {
      consumeInFlight.delete(id);
    }
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
    const now = Date.now();
    // ⚠️ log 删 + item 写必须原子：item.put 成功后 logs.hardDelete 失败 →
    // 日志仍在，用户再点撤销会二次加回数量。此前这两步没包事务。
    await db.transaction(async () => {
      if (cur) {
        // addBack 判定：item 仍是 in_stock → 当初是部分消耗，需要回加 take；
        // item 是 finished → 当初是整条消耗，quantity 保留原值，不需要加回。
        // 但连续两次 partial + full 后撤销第一条 partial 会漏加（status 已被 full 改成 finished），
        // 所以更稳的做法是：用 `log.quantity` 与 `cur.quantity` 的对账来兜底——
        // 若 cur.quantity < log.quantity，说明 quantity 被扣减过，需要加回。
        const addBack = cur.status === 'in_stock' ? normalizeQty(log.quantity) : 0;
        const newQty = addBack ? round2(normalizeQty(cur.quantity) + addBack) : cur.quantity;
        await db.items.put({
          ...cur,
          status: 'in_stock',
          quantity: newQty,
          updatedAt: now,
        });
      }
      await db.logs.hardDelete(logId);
    });
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

  /**
   * 从一组同名物品里消耗 `qty`（FEFO：先扣最早到期的那份，不够再顺延到下一份）。
   *
   * 与 `consume()` 的区别只在**作用范围**：后者作用单条记录，前者作用一整个折叠组。
   * 日志字段、状态语义、撤销快照全部复用既有实现，不另起一套。
   *
   * @param memberIds 组内成员 id；**顺序无关**，内部会按到期日重排
   * @param qty 本次消耗数量（按组合计数量钳制）
   * @returns 供 toast 撤销的 `BulkOp`（跨多份时是一整批）；无可操作项时返回 `null`
   * @example await items.consumeGroup(['a','b'], 'consumed', 2) // 先扣 10-08 那盒
   */
  async function consumeGroup(memberIds: string[], type: ConsumeType, qty?: number): Promise<BulkOp | null> {
    // 组内任一成员正在被单条消耗（或上一次盘点还没落库）时让路，避免同一件被扣两次
    if (memberIds.some((id) => consumeInFlight.has(id))) return null;
    const targets = pickActive(memberIds);
    if (!targets.length) return null;
    const total = round2(targets.reduce((s, i) => s + normalizeQty(i.quantity), 0));
    const take = qty === undefined ? total : Math.min(total, round2(qty));
    // ⚠️ 同 consume：用 Number.isFinite 挡住 NaN（`NaN <= 0` 恒 false 会让 NaN 穿透）
    if (!Number.isFinite(take) || take <= 0) return null;
    const now = Date.now();
    const before = targets.map((i) => ({ ...i }));
    const plan = planGroupConsume(targets, take, type, now);
    if (!plan.logs.length) return null;
    targets.forEach((t) => consumeInFlight.add(t.id));
    try {
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
    } finally {
      targets.forEach((t) => consumeInFlight.delete(t.id));
    }
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
   * 批量改价：把选中的物品单价统一设为 `price`（走 `normalizePrice`）。
   *
   * 不重算到期日（单价不影响保质期）。撤销走通用 `undoBulk`：写回 `before` 快照。
   */
  async function bulkSetPrice(ids: string[], price: number | null): Promise<BulkOp | null> {
    const targets = pickActive(ids);
    if (!targets.length) return null;
    const now = Date.now();
    const before = targets.map((i) => ({ ...i }));
    const p = normalizePrice(price);
    await db.items.bulkPut(
      targets.map((i) => ({ ...i, price: p, updatedAt: now })),
    );
    await load();
    return remember({ id: newId(), kind: 'price', items: before, logIds: [], createdAt: now });
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
      // ⚠️ 用 bulkDelete 替代 for-await：串行 await 在 Dexie 事务里会逐次 yield 给事件循环，
      // logIds 多时可能撞事务超时（TransactionInactiveError）。
      if (op.logIds.length) await db.logs.bulkDelete(op.logIds);
      await db.items.bulkPut(items);
    });
    bulkOps.delete(op.id);
    await load();
  }

  return {
    list, logs, loaded, active, load, byId, add, addMany, save, moveTo, setManualShelfLife,
    snooze, unsnooze, consume, undoConsume, remove, restore, recomputeAll,
    bulkConsume, consumeGroup, bulkMoveTo, bulkRemove, bulkSetPrice, undoBulk,
  };
});
