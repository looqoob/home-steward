/**
 * 「今日待办」的计算（纯函数）。
 *
 * 为什么单独一个模块：待办的**数字、列表、通知**三处必须口径完全一致，
 * 否则会出现「概览卡显示 3，点进去只有 2 条」「待办里没有它，通知却弹出来」这类
 * 信任崩塌的 bug。三处都调用这里的 `buildTodayTodo`，从根上避免分叉。
 */

import type { Item, Settings } from './types';
import { freshnessOf, type Freshness } from './freshness';
import { diffDays } from './dates';

const DAY = 24 * 60 * 60 * 1000;

/** 待办只有两种：已过期与紧急（≤ urgentDays）。`soon` / `fresh` 不该进待办 */
export type TodoState = 'over' | 'urgent';

export interface TodoEntry {
  item: Item;
  state: TodoState;
  /** 剩余天数；已过期为负数（绝对值 = 已过期天数） */
  remainDays: number;
  /** 徽标文案，直接复用 `freshnessOf` 的措辞避免两处说法不一致 */
  label: string;
}

/**
 * 「明天再说」是否生效中。
 *
 * ⚠️ 必须用 `?? null` 兜底：`snoozeUntil` 是 v2 新增的可选字段，旧数据里是 `undefined`。
 * 直接写 `item.snoozeUntil > now` 依赖了 `undefined > number` 的隐式转换（结果碰巧是 false），
 * 很脆且换个人写就可能写错。
 */
export function isSnoozed(item: Item, now: number = Date.now()): boolean {
  const until = item.snoozeUntil ?? null;
  return until !== null && until > now;
}

/**
 * 计算「明天再说」的截止时刻。
 * @param days 延后天数，默认 1；传 0 或负数表示**立即取消延后**（返回 `null`）。
 */
export function snoozeUntilOf(item: Item, days: number, now: number = Date.now()): number | null {
  if (!Number.isFinite(days) || days <= 0) return null;
  const until = item.snoozeUntil ?? null;
  // 已经延过 3 天、用户又说「明天再说」→ 从**当前时刻**再延，而不是从原截止点叠加，
  // 否则反复点会让它无限期消失。
  const base = until !== null && until > now ? until : now;
  return base + Math.round(days * DAY);
}

/**
 * 构建今日待办列表。
 *
 * 纳入条件：在库 + 未删除 + 有到期日 + （已过期 或 剩余 ≤ urgentDays）+ 未处于延后期。
 *
 * 排序：**已过期优先**（过期越久越靠前），其次按剩余天数升序。
 *
 * @param items 全量物品（内部自行过滤 deletedAt / status）
 * @param today 'YYYY-MM-DD'
 * @param now 当前时刻，用于判定延后是否到期；便于测试
 * @example buildTodayTodo(items, '2026-10-05', { urgentDays: 3, soonDays: 14 })
 */
export function buildTodayTodo(
  items: Item[],
  today: string,
  settings: Pick<Settings, 'urgentDays' | 'soonDays'>,
  now: number = Date.now(),
): TodoEntry[] {
  const out: TodoEntry[] = [];
  for (const item of items) {
    if (item.deletedAt || item.status !== 'in_stock' || !item.expireAt) continue;
    if (isSnoozed(item, now)) continue;
    const f: Freshness = freshnessOf(item, today, settings);
    if (f.state !== 'over' && f.state !== 'urgent') continue;
    out.push({
      item,
      state: f.state,
      remainDays: diffDays(item.expireAt, today),
      label: f.label,
    });
  }
  // 已过期的 remainDays 是负数（过期越久越负），紧急的是 0..urgentDays；
  // 两者一起升序排就天然实现了「已过期在前、且过期越久越靠前」，不需要额外比较。
  return out.sort((a, b) => {
    return a.remainDays - b.remainDays || a.item.name.localeCompare(b.item.name, 'zh-Hans-CN');
  });
}
