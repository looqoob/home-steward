/**
 * 月末库存快照（v1.1 F4，纯函数）。
 *
 * ## 为什么需要快照
 *
 * 「这个月到底吃掉 / 浪费 / 新买了什么」——只有消耗日志回答不了「新购」，
 * 只有当前库存回答不了「消失」。把**上月末的在库状态**定格一份，
 * 与当前在库做差集，两边就都有了。
 *
 * ## 生成时机（次月首启）
 *
 * 每月 1 号之后第一次打开 App 时，当前在库 ≈ 上月末的状态（App 没开就不可能有增减），
 * 此时补写一份「上月」的快照。用户 2 号才打开，就写 2 号的状态 —— 与真实月末
 * 的差异只是「1 号当天没来得及记的增减」，可接受。**跨了多个月没打开**的月份
 * 无法补齐（没有数据源），对比视图会显示「该月无快照」。
 */

import type { ConsumeLog, Item, SnapshotItem, StockSnapshot } from './types';
import { foldKeyOf } from './grouping';
import { normalizeName } from './normalize';
import { fromEpoch, monthKey, todayStr } from './dates';
import type { AliasKeyResolver } from './inbound';

/** 'YYYY-MM' → 上一个月的 'YYYY-MM'（跨年正确：2027-01 → 2026-12） */
export function previousMonthKey(now: number = Date.now()): string {
  const d = new Date(now);
  const t = new Date(d.getFullYear(), d.getMonth() - 1, 1);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * 把在库物品定格为某月的快照（只拷贝对比需要的字段；价格原样带出，
 * `Item.price` 落库前已经过 `normalizePrice`）。
 */
export function snapshotFromItems(month: string, items: Item[], now: number = Date.now()): StockSnapshot {
  const rows: SnapshotItem[] = items
    .filter((i) => !i.deletedAt && i.status === 'in_stock')
    .map((i) => ({
      id: i.id,
      name: i.name,
      dictKey: i.dictKey,
      quantity: i.quantity,
      unit: i.unit,
      price: i.price,
      locationId: i.locationId,
    }));
  return { id: month, month, items: rows, createdAt: now, updatedAt: now, deletedAt: null };
}

/** 快照对比的一行：新购（in）/ 减少（out），`note` 只对 out 有意义 */
export interface SnapshotDiffRow {
  name: string;
  qty: number;
  unit: string;
  kind: 'in' | 'out';
  /** out 行的去向说明：「用掉」「扔掉」「用掉+扔掉」或「无消耗记录（可能已删除）」 */
  note: string;
}

export interface SnapshotDiff {
  /** 本月新出现的 / 数量变多的 */
  added: SnapshotDiffRow[];
  /** 本月消失的 / 数量变少的 */
  removed: SnapshotDiffRow[];
}

/** 按折叠键聚合数量（键含位置与单位，与库存列表的折叠口径一致） */
function qtyByKey(items: { dictKey: string | null; name: string; locationId: string; unit: string; quantity: number }[], aliasKey?: AliasKeyResolver) {
  const m = new Map<string, { name: string; qty: number; unit: string }>();
  for (const it of items) {
    const k = foldKeyOf(it, aliasKey);
    const cur = m.get(k);
    if (cur) cur.qty += it.quantity;
    else m.set(k, { name: it.name, qty: it.quantity, unit: it.unit });
  }
  return m;
}

/**
 * 上月快照 vs 当前在库的差集。
 *
 * - 键口径与库存折叠**同一把**（`foldKeyOf`，含别名 / 位置 / 单位），
 *   否则「牛奶」在两边的键不一致，会把同一件东西误报成「消失 + 新购」各一条；
 * - `monthLogs` 用于给「减少」行对账去向：命中消耗日志标「用掉 / 扔掉」，
 *   没命中标「无消耗记录」（多半是直接删除，或跨月消耗）。
 */
export function diffMonth(
  prev: StockSnapshot,
  current: Item[],
  monthLogs: ConsumeLog[],
  aliasKey?: AliasKeyResolver,
): SnapshotDiff {
  const before = qtyByKey(prev.items, aliasKey);
  const after = qtyByKey(
    current.filter((i) => !i.deletedAt && i.status === 'in_stock'),
    aliasKey,
  );

  // 本月日志的归一名集合（按 type 分开，供去向对账）
  const consumedNames = new Set<string>();
  const wastedNames = new Set<string>();
  for (const l of monthLogs) {
    if (l.deletedAt) continue;
    if (typeof l.at !== 'number' || !Number.isFinite(l.at) || l.at <= 0) continue;
    (l.type === 'wasted' ? wastedNames : consumedNames).add(normalizeName(l.name));
  }
  const noteOf = (name: string): string => {
    const c = consumedNames.has(normalizeName(name));
    const w = wastedNames.has(normalizeName(name));
    if (c && w) return '用掉+扔掉';
    if (c) return '用掉';
    if (w) return '扔掉';
    return '无消耗记录';
  };

  const added: SnapshotDiffRow[] = [];
  const removed: SnapshotDiffRow[] = [];
  for (const [k, a] of after) {
    const b = before.get(k);
    if (!b) added.push({ name: a.name, qty: a.qty, unit: a.unit, kind: 'in', note: '' });
    else if (a.qty - b.qty > 0) added.push({ name: a.name, qty: a.qty - b.qty, unit: a.unit, kind: 'in', note: '' });
  }
  for (const [k, b] of before) {
    const a = after.get(k);
    if (!a) removed.push({ name: b.name, qty: b.qty, unit: b.unit, kind: 'out', note: noteOf(b.name) });
    else if (b.qty - a.qty > 0) removed.push({ name: b.name, qty: b.qty - a.qty, unit: b.unit, kind: 'out', note: noteOf(b.name) });
  }
  const byName = (x: SnapshotDiffRow, y: SnapshotDiffRow) => x.name.localeCompare(y.name, 'zh-Hans-CN');
  return { added: added.sort(byName), removed: removed.sort(byName) };
}

/** 「本月」日志的过滤谓词（StatsView 传入 `items.logs` 用） */
export function isCurrentMonthLog(l: ConsumeLog, now: number): boolean {
  if (typeof l.at !== 'number' || !Number.isFinite(l.at) || l.at <= 0) return false;
  return monthKey(fromEpoch(l.at)) === monthKey(todayStr(now));
}
