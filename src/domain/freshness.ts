import type { Item, Settings } from './types';
import { diffDays } from './dates';

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
  if (!item.expireAt) {
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

export function badgeClass(state: FreshnessState): string {
  switch (state) {
    case 'fresh':
      return 'b-fresh';
    case 'soon':
      return 'b-soon';
    case 'urgent':
      return 'b-urgent';
    case 'over':
      return 'b-over';
    default:
      return 'b-over';
  }
}

export function barColor(state: FreshnessState): string {
  switch (state) {
    case 'fresh':
      return 'var(--state-fresh-bar)';
    case 'soon':
      return 'var(--state-soon-bar)';
    case 'urgent':
      return 'var(--state-urgent-bar)';
    default:
      return 'var(--state-over-bar)';
  }
}

/** 按剩余天数升序；不计保质期/未设置的排最后 */
export function sortByFreshness<T extends { sortKey: number; name: string }>(list: T[]): T[] {
  return [...list].sort((a, b) => (a.sortKey - b.sortKey) || a.name.localeCompare(b.name, 'zh-Hans-CN'));
}
