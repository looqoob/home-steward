import type { ConsumeLog, Item, Location } from './types';
import { diffDays, fromEpoch, monthKey, todayStr } from './dates';

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
 * - 浪费金额累加 `price ?? 0`。日志里的 `price` 已是「单价 × 本次数量」的**本次金额**，
 *   没填价格的商品计 0，不报错。
 *
 * @param now epoch 毫秒，决定「本月」是哪个月。默认 `Date.now()`，便于测试。
 * @example const { inbound, consumed, wastedCount, wastedAmount } = monthStats(items, logs);
 */
export function monthStats(items: Item[], logs: ConsumeLog[], now: number = Date.now()): MonthStats {
  const key = monthKey(todayStr(now));
  let inbound = 0;
  for (const i of items) {
    if (i.deletedAt) continue;
    if (monthKey(i.storedAt) === key) inbound++;
  }
  let consumed = 0;
  let wastedCount = 0;
  let wastedAmount = 0;
  for (const l of logs) {
    if (l.deletedAt) continue;
    if (monthKey(fromEpoch(l.at)) !== key) continue;
    if (l.type === 'consumed') consumed += l.quantity;
    else {
      wastedCount += l.quantity;
      wastedAmount += l.price ?? 0;
    }
  }
  return { inbound, consumed, wastedCount, wastedAmount };
}

export interface LocationSlice {
  locationId: string;
  name: string;
  count: number;
  color: string;
  percent: number;
}

/**
 * 位置分布统计（「我的」页的分布条用）。
 *
 * - 只统计**未删除且启用**的位置，且**只返回 `count > 0` 的片**（空位置不占视觉空间）；
 * - 结果按数量**降序**排列；
 * - `total` 为空时分母按 1 处理（避免 NaN），此时结果为空数组。
 *
 * @param colorOf 环境 → 颜色的映射函数，通常传 `(env) => ENV_MAP[env].color`。
 * @example locationDistribution(items, locations, (env) => ENV_MAP[env].color)
 */
export function locationDistribution(items: Item[], locations: Location[], colorOf: (env: Location['env']) => string): LocationSlice[] {
  const live = items.filter((i) => !i.deletedAt && i.status === 'in_stock');
  const total = live.length || 1;
  return locations
    .filter((l) => !l.deletedAt && l.enabled)
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
}

export interface TodayOverview {
  /** 今日待吃（紧急 + 已过期） */
  dueToday: number;
  /** 已过期 */
  overdue: number;
}

/**
 * 今日概览。
 *
 * @param today 日期字符串 'YYYY-MM-DD'
 * @param urgentDays 紧急阈值；`0 ≤ 剩余天数 ≤ urgentDays` 计入「今日待吃」
 * @returns `dueToday` = 紧急 + 已过期的数量；`overdue` = 仅已过期数量（`overdue ≤ dueToday`）
 * @remarks 只统计**有 `expireAt`** 的在库商品；不计保质期的（环境 `none`）不进统计。
 */
export function todayOverview(items: Item[], today: string, urgentDays: number): TodayOverview {
  const live = items.filter((i) => !i.deletedAt && i.status === 'in_stock' && i.expireAt);
  let dueToday = 0;
  let overdue = 0;
  for (const i of live) {
    const d = diffDays(i.expireAt as string, today);
    if (d < 0) {
      overdue++;
      dueToday++;
    } else if (d <= urgentDays) dueToday++;
  }
  return { dueToday, overdue };
}
