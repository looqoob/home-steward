import type { ConsumeLog, Item, Location } from './types';
import { CATEGORY_LABEL } from './types';
import { monthKey, todayStr, isDateStr, fromEpoch, diffDays } from './dates';
import { normalizeName } from './normalize';
// 金额口径复用 domain/price：累加前先把脏值（字符串 / 负数）归成 null，
// 否则一次 `+=` 字符串拼接就能把整月「浪费金额」变成 NaN。
import { normalizePrice, normalizeQty, amountOf, round2 } from './price';

/**
 * 合法日期字符串才参与统计。
 *
 * ⚠️ 不要图省事写成 `monthKey(i.storedAt)`：脏数据（`storedAt: 0`）会让
 * `.slice` 抛错，而**统计页与「我的」页都是主 Tab**，一抛错就是白屏，
 * 且数据只在本机、没有副本可回滚。备份导入已做清洗（`data/backup/sanitize.ts`），
 * 这里再挡一道是为了兜住「导入之前就已经存在的脏数据」。
 */
function dateOf(v: unknown): string | null {
  return isDateStr(v) ? v : null;
}

/**
 * 合法的事件时间戳才参与统计（`ConsumeLog.at`）。
 *
 * 守的是 `fromEpoch(NaN)` → `'NaN-NaN-NaN'` 这条链：不抛错但被静默丢弃，
 * 统计**悄悄少算**而无人知晓（REV-30）。非法 `at`（非数字 / 非有限数）直接跳过该条。
 */
function epochOf(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null;
}

export interface MonthStats {
  /** 本月入库件数 */
  inbound: number;
  /** 本月消耗**数量**（累加日志 quantity；支持部分消耗后不再是「日志条数」） */
  consumed: number;
  /** 本月浪费**数量**（累加日志 quantity） */
  wastedCount: number;
  /** 本月浪费金额 */
  wastedAmount: number;
}

/**
 * 计算「本月」统计。
 *
 * - 入库按 `Item.storedAt` 的月份计，**包含**已用完（`finished`）的商品；
 * - 消耗 / 浪费按 `ConsumeLog.at`（事件发生时间，不是 `createdAt`）的月份计；
 * - 消耗 / 浪费累加的是 `ConsumeLog.quantity`（**数量口径**）：吃掉 2 个鸡蛋记 2，
 *   而不是「一次操作记 1 件」；
 * - 浪费金额累加 `normalizePrice(price) ?? 0`。日志里的 `price` 已是「单价 × 本次数量」的
 *   **本次金额**；没填价格的商品计 0，脏值（字符串 / 负数）先归 null 再计 0 ——
 *   直接 `+=` 字符串会拼出 `"035"`，整月金额跟着烂掉。
 *
 * @param now epoch 毫秒，决定「本月」是哪个月。默认 `Date.now()`，便于测试。
 * @example const { inbound, consumed, wastedCount, wastedAmount } = monthStats(items, logs);
 */
export function monthStats(items: Item[], logs: ConsumeLog[], now: number = Date.now()): MonthStats {
  const key = monthKey(todayStr(now));
  let inbound = 0;
  for (const i of items) {
    if (i.deletedAt) continue;
    const storedAt = dateOf(i.storedAt);
    if (storedAt && monthKey(storedAt) === key) inbound++;
  }
  let consumed = 0;
  let wastedCount = 0;
  let wastedAmount = 0;
  for (const l of logs) {
    if (l.deletedAt) continue;
    const at = epochOf(l.at);
    if (at === null || monthKey(fromEpoch(at)) !== key) continue;
    if (l.type === 'consumed') consumed += normalizeQty(l.quantity);
    else {
      wastedCount += normalizeQty(l.quantity);
      wastedAmount += normalizePrice(l.price) ?? 0;
    }
  }
  return { inbound, consumed, wastedCount, wastedAmount };
}

export interface LocationSlice {
  /** 位置 id；「未分配」桶（孤儿 locationId / 全部位置停用）为 `null` */
  locationId: string | null;
  name: string;
  count: number;
  color: string;
  percent: number;
}

/**
 * 位置分布统计（「我的」页的分布条用）。
 *
 * - 只统计**未删除且启用**的位置，且**只返回 `count > 0` 的片**（空位置不占视觉空间）；
 * - `locationId` 指向不存在 / 已停用 / 已删除位置的物品（孤儿引用）归入
 *   **「未分配」桶**（`locationId: null`）——此前它们不计入任何片，
 *   各片百分比相加 < 100%，用户会以为统计丢了数据（REV-13）；
 * - 结果按数量**降序**排列，「未分配」恒排最后（它是异常态，不该抢真实位置的位置）；
 * - `total` 为空时分母按 1 处理（避免 NaN），此时结果为空数组。
 *
 * @param colorOf 环境 → 颜色的映射函数，通常传 `(env) => ENV_MAP[env].color`。
 * @param opts.unassignedColor 「未分配」片的颜色。默认取 `ENV_MAP.none` 同款中性灰。
 * @example locationDistribution(items, locations, (env) => ENV_MAP[env].color)
 */
export function locationDistribution(
  items: Item[],
  locations: Location[],
  colorOf: (env: Location['env']) => string,
  opts: { unassignedColor?: string } = {},
): LocationSlice[] {
  const live = items.filter((i) => !i.deletedAt && i.status === 'in_stock');
  const total = live.length || 1;
  const usable = new Set(locations.filter((l) => !l.deletedAt && l.enabled).map((l) => l.id));
  const slices: LocationSlice[] = locations
    .filter((l) => usable.has(l.id))
    .map((l) => {
      const count = live.filter((i) => i.locationId === l.id).length;
      return {
        locationId: l.id,
        name: l.name,
        count,
        color: colorOf(l.env),
        percent: count / total,
      };
    })
    .filter((s) => s.count > 0)
    .sort((a, b) => b.count - a.count);
  const unassigned = live.filter((i) => !usable.has(i.locationId)).length;
  if (unassigned > 0) {
    slices.push({
      locationId: null,
      name: '未分配',
      count: unassigned,
      // 中性灰，与 ENV_MAP['none'] 的 #5E6B78 同源（环境色不在 domain 硬编码，由默认值对齐）
      color: opts.unassignedColor ?? '#5E6B78',
      percent: unassigned / total,
    });
  }
  return slices;
}

/* ==================== 统计页 ==================== */

/**
 * 样本量下限。
 *
 * 拿 2 笔数据画 6 个月的趋势、拿 1 笔算「平均周转 2 天」，都是在**用精确的数字撒谎**。
 * 达不到下限就返回 `null` / 空数组，由页面显示「数据不足」——
 * 宁可什么都不说，也不要给一个自己会信的假结论。
 */
export const MIN_TREND_MONTHS = 2;
export const MIN_TURNOVER_SAMPLES = 5;

export interface WastePoint {
  /** 'YYYY-MM' */
  month: string;
  /** 展示用短标签，如「10月」 */
  label: string;
  /** 该月浪费金额（元） */
  amount: number;
  /** 该月浪费数量 */
  count: number;
}

/** 往前推 n 个月的 'YYYY-MM' 键，从早到晚 */
function lastMonths(months: number, now: number): string[] {
  const d = new Date(now);
  const out: string[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const t = new Date(d.getFullYear(), d.getMonth() - i, 1);
    out.push(`${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}`);
  }
  return out;
}

/**
 * 近 N 个月的浪费趋势。
 *
 * 金额累加 `ConsumeLog.price`（**本次金额**，不是单价；脏值先归一化），空月份补 0 —— 折线图要连续，
 * 缺月会被画成「从 3 月直连 6 月」的假象。
 *
 * @returns 有数据的月份数 < `MIN_TREND_MONTHS` 时返回空数组（页面显示「数据不足」）
 * @example wasteTrend(logs, 6) // → [{ month: '2026-05', label: '5月', amount: 12, count: 3 }, …]
 */
export function wasteTrend(logs: ConsumeLog[], months = 6, now: number = Date.now()): WastePoint[] {
  const keys = lastMonths(months, now);
  const set = new Set(keys);
  const acc = new Map<string, { amount: number; count: number }>();
  let monthsWithData = 0;
  for (const l of logs) {
    if (l.deletedAt || l.type !== 'wasted') continue;
    const at = epochOf(l.at);
    if (at === null) continue;
    const k = monthKey(fromEpoch(at));
    if (!set.has(k)) continue;
    const cur = acc.get(k) ?? { amount: 0, count: 0 };
    cur.amount += normalizePrice(l.price) ?? 0;
    cur.count += normalizeQty(l.quantity);
    acc.set(k, cur);
  }
  for (const v of acc.values()) if (v.count > 0) monthsWithData++;
  if (monthsWithData < MIN_TREND_MONTHS) return [];
  return keys.map((k) => {
    const v = acc.get(k) ?? { amount: 0, count: 0 };
    return { month: k, label: `${Number(k.slice(5, 7))}月`, amount: round2(v.amount), count: v.count };
  });
}

export interface StockValue {
  /** 在库物资总价值（**含已过期**） */
  total: number;
  /** 其中**已过期**部分的价值。单独给出是因为「总价值」里混着这部分会让人高估可用物资 */
  overAmount: number;
  /** 已填单价的件数 */
  priced: number;
  /** 没填单价的件数（不计入金额，但必须让用户知道有多少没算进去） */
  unpriced: number;
}

/**
 * 在库物资总价值。
 *
 * ## 为什么**过期要计入**
 *
 * 用户拍板的口径：**计入，但单独标出来**。理由是过期的东西还没扔，
 * 它仍然占着冰箱里的位置、也仍然代表着已经花出去的钱 —— 从总资产角度它就是还在。
 * 混在总数里会让人高估「还能用的物资」，所以 `overAmount` 单独返回，由界面标注。
 *
 * ## 金额怎么算
 *
 * `amountOf(price, quantity)` = 单价 × 数量。`Item.price` 的语义是**每 1 单位**的价格，
 * 直接累加单价会漏掉「20 个鸡蛋」里的 19 个。
 *
 * ## 没填价的东西
 *
 * 不计入金额（不是计 0 —— 计 0 会让总数看起来是真实值），但 `unpriced` 如实计数，
 * 界面必须说出来，否则用户会以为「在库 ¥86」覆盖了全部库存。
 *
 * @param today `YYYY-MM-DD`，决定「已过期」的判定基准
 */
export function stockValue(items: Item[], today: string = todayStr()): StockValue {
  let total = 0;
  let overAmount = 0;
  let priced = 0;
  let unpriced = 0;
  for (const i of items) {
    if (i.deletedAt || i.status !== 'in_stock') continue;
    const amount = amountOf(i.price, i.quantity);
    if (amount === null) {
      unpriced++;
      continue;
    }
    priced++;
    total += amount;
    // YYYY-MM-DD 的字典序 == 日期序，可以直接比字符串
    const expireAt = dateOf(i.expireAt);
    if (expireAt && expireAt < today) overAmount += amount;
  }
  return { total: round2(total), overAmount: round2(overAmount), priced, unpriced };
}

export interface WastedTop {
  name: string;
  /** 累计浪费数量 */
  count: number;
  /** 累计浪费金额 */
  amount: number;
}

/**
 * 「最常浪费」Top N，按**累计浪费金额**降序。
 *
 * ⚠️ 聚合键走 `normalizeName`：「番茄（西红柿）」与「番茄」是**同一件东西**，
 * 各占一行会让 Top5 的名次失真（REV-47）；展示名取首次出现的原名。
 *
 * ⚠️ 金额可能全是 0（用户没填价格），此时退化为按数量排 —— 仍然返回一个有用的顺序，
 * 比「因为都是 0 所以随机排」好。
 * @returns 没有浪费记录时返回空数组
 */
export function topWasted(logs: ConsumeLog[], n = 5): WastedTop[] {
  const acc = new Map<string, WastedTop>();
  for (const l of logs) {
    if (l.deletedAt || l.type !== 'wasted') continue;
    const k = normalizeName(l.name);
    const cur = acc.get(k) ?? { name: l.name, count: 0, amount: 0 };
    cur.count += normalizeQty(l.quantity);
    cur.amount += normalizePrice(l.price) ?? 0;
    acc.set(k, cur);
  }
  const list = [...acc.values()].map((x) => ({ ...x, amount: round2(x.amount) }));
  return list
    .sort((a, b) => b.amount - a.amount || b.count - a.count || a.name.localeCompare(b.name, 'zh-Hans-CN'))
    .slice(0, n);
}

/**
 * 平均周转天数：入库 → 第一次被消耗掉，间隔多少天。
 *
 * 只统计**已用完且有消耗日志**的物品（按 `itemId` 关联），用第一次消耗的时间算 ——
 * 20 个鸡蛋分 4 次吃完，用第 4 次的时间会把「周转」拖成 30 天，那是**消耗周期**不是周转速度。
 *
 * @returns 匹配样本 < `MIN_TURNOVER_SAMPLES` 时返回 `null`（页面显示「数据不足」）
 */
export function turnoverDays(items: Item[], logs: ConsumeLog[]): number | null {
  const first = new Map<string, number>();
  for (const l of logs) {
    if (l.deletedAt || l.type !== 'consumed') continue;
    const at = epochOf(l.at);
    if (at === null) continue;
    const prev = first.get(l.itemId);
    if (prev === undefined || at < prev) first.set(l.itemId, at);
  }
  const gaps: number[] = [];
  for (const i of items) {
    // 只统计**已用完**的物品（与 JSDoc 的口径一致，REV-46）：还在库里的物品
    // 只有「入库到现在」的时长，没有「入库到消耗」的完整周期，混进来会把周转拉长。
    if (i.deletedAt || i.status !== 'finished') continue;
    const at = first.get(i.id);
    const storedAt = dateOf(i.storedAt);
    // 入库日非法就跳过：宁可少一个样本，也不能让 parseDate 抛错把主 Tab 打成白屏
    if (at === undefined || !storedAt) continue;
    // 入库日到消耗日；入库日晚于消耗日说明数据异常（补录），跳过而不是算出负数
    const d = diffDays(fromEpoch(at), storedAt);
    if (d >= 0) gaps.push(d);
  }
  if (gaps.length < MIN_TURNOVER_SAMPLES) return null;
  const sum = gaps.reduce((a, b) => a + b, 0);
  return round2(sum / gaps.length);
}

export interface CategorySlice {
  category: string;
  label: string;
  count: number;
  percent: number;
}

/**
 * 在库物品的品类分布。
 *
 * `category` 为 `null` 的归到「其他」—— 用户手打的自定义食材没有品类，
 * 但不能因此从统计里消失（那会让各项占比加起来不等于 100%）。
 */
export function categoryDistribution(items: Item[]): CategorySlice[] {
  const live = items.filter((i) => !i.deletedAt && i.status === 'in_stock');
  const total = live.length || 1;
  const acc = new Map<string, number>();
  for (const i of live) {
    const k = i.category ?? 'other';
    acc.set(k, (acc.get(k) ?? 0) + 1);
  }
  return [...acc.entries()]
    .map(([category, count]) => ({
      category,
      label: CATEGORY_LABEL[category as keyof typeof CATEGORY_LABEL] ?? '其他',
      count,
      percent: count / total,
    }))
    .sort((a, b) => b.count - a.count);
}
