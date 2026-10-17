import type { Item, Settings } from './types';
import { diffDays, isDateStr } from './dates';

export type FreshnessState = 'fresh' | 'soon' | 'urgent' | 'over' | 'warn' | 'none';

export interface Freshness {
  state: FreshnessState;
  label: string;
  remainDays: number | null;
  /** 0–1，过期固定 0.04，与原型一致 */
  progress: number | null;
  /** 排序用：越小越靠前 */
  sortKey: number;
}

const SORT_LAST = 1e9;

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

export function freshnessOf(item: Item, today: string, settings: Pick<Settings, 'soonDays' | 'urgentDays'>): Freshness {
  // ⚠️ 必须用 `isDateStr` 而不是 `!item.expireAt`：脏数据（`expireAt: 0`）为假值时
  // 会被真值判断挡下（这里没事），但 `expireAt: 'abc'` 这种**真值**脏数据能穿过 `!x`，
  // 接着在 `diffDays` → `parseDate` 里 `.split` 抛错 —— 而库存页是访问量最高的页面，
  // 一抛错整页白屏，且数据只在本机无法回滚。备份导入已清洗（`data/backup/sanitize.ts`），
  // 这里再挡一道兜住导入前就存在的脏数据。
  if (!isDateStr(item.expireAt)) {
    if (item.notRecommended) {
      return { state: 'warn', label: '不建议存放', remainDays: null, progress: null, sortKey: SORT_LAST - 1 };
    }
    return { state: 'none', label: '未设保质期', remainDays: null, progress: null, sortKey: SORT_LAST };
  }

  const d = diffDays(item.expireAt, today);
  let state: FreshnessState;
  let label: string;
  if (d < 0) {
    state = 'over';
    label = `已过期 ${-d} 天`;
  } else if (d <= settings.urgentDays) {
    state = 'urgent';
    label = `剩 ${d} 天`;
  } else if (d <= settings.soonDays) {
    state = 'soon';
    label = `剩 ${d} 天`;
  } else {
    state = 'fresh';
    label = `剩 ${d} 天`;
  }

  const denom = item.shelfLifeDays && item.shelfLifeDays > 0 ? item.shelfLifeDays : Math.max(d, 1);
  const progress = d < 0 ? 0.04 : clamp(d / denom, 0.04, 1);

  return { state, label, remainDays: d, progress, sortKey: d };
}

export function barColor(state: FreshnessState): string {
  switch (state) {
    case 'fresh':
      return 'var(--state-fresh-bar)';
    case 'soon':
      return 'var(--state-soon-bar)';
    case 'urgent':
      return 'var(--state-urgent-bar)';
    case 'over':
      return 'var(--state-over-bar)';
    // ⚠️ warn / none 此前走 default（= over 红色），组内成员色条会被误染成过期色
    default:
      return 'var(--ink-3)';
  }
}

/** 按剩余天数升序；不计保质期/未设置的排最后 */
export function sortByFreshness<T extends { sortKey: number; name: string }>(list: T[]): T[] {
  return [...list].sort((a, b) => (a.sortKey - b.sortKey) || a.name.localeCompare(b.name, 'zh-Hans-CN'));
}

/* ==================== 列表分组 ==================== */

/** 库存列表的四个展示分组；与六态 `FreshnessState` 是多对一关系 */
export type FreshGroup = 'urgent' | 'soon' | 'fresh' | 'none';

export const GROUP_LABEL: Record<FreshGroup, string> = {
  urgent: '紧急待吃',
  soon: '临期',
  fresh: '新鲜',
  none: '未设保质期',
};

/** 分组展示顺序：最需要处理的在最前 */
export const GROUP_ORDER: FreshGroup[] = ['urgent', 'soon', 'fresh', 'none'];

/**
 * 六态 → 四组。`over`（已过期）并入 `urgent` 组的最前面，
 * 因为它比「临期」更需要处理；`warn`（不建议存放）与 `none` 都归到「未设保质期」。
 */
export function groupOf(state: FreshnessState): FreshGroup {
  switch (state) {
    case 'over':
    case 'urgent':
      return 'urgent';
    case 'soon':
      return 'soon';
    case 'fresh':
      return 'fresh';
    default:
      return 'none'; // 'warn' | 'none'
  }
}

export interface FreshGroupBundle<T> {
  group: FreshGroup;
  label: string;
  items: T[];
}

/**
 * 把**已按 `sortByFreshness` 排好序**的列表切成带分组头的段落。
 *
 * - 保持传入顺序，不做二次排序（组内顺序 = 剩余天数升序）；
 * - 空组自动跳过，调用方无需再判空；
 * - 返回的组顺序固定为 `GROUP_ORDER`。
 *
 * @example groupByFreshness([{ state: 'over' }, { state: 'fresh' }])
 * // → [{ group: 'urgent', label: '紧急待吃', items: [over] },
 * //    { group: 'fresh',  label: '新鲜',     items: [fresh] }]
 */
export function groupByFreshness<T extends { state: FreshnessState }>(list: T[]): FreshGroupBundle<T>[] {
  const buckets = new Map<FreshGroup, T[]>();
  for (const it of list) {
    const g = groupOf(it.state);
    const arr = buckets.get(g);
    if (arr) arr.push(it);
    else buckets.set(g, [it]);
  }
  return GROUP_ORDER.filter((g) => buckets.has(g)).map((g) => ({
    group: g,
    label: GROUP_LABEL[g],
    items: buckets.get(g) as T[],
  }));
}
