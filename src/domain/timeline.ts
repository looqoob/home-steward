/**
 * 「时间轴」视图的到期日分桶（纯函数）。
 *
 * ## 为什么复用 `freshnessOf`
 *
 * 分组视图与时间轴视图必须对「哪件该先吃」给出**同一个答案**。
 * 如果这里自己按 `expireAt` 再算一遍距离，就会出现「分组里在『新鲜』、时间轴里在『今天到期』」
 * 的矛盾，而这种矛盾用户是查不出来的 —— 只能得出「这 App 有点毛病」的结论。
 * 所以桶的判定一律建立在 `Freshness` 的 `state` / `remainDays` 之上，不重新解析日期。
 */

import type { Freshness, FreshnessState } from './freshness';

export type TimeBucket = 'over' | 'today' | 'tomorrow' | 'week' | 'later' | 'none';

export const BUCKET_LABEL: Record<TimeBucket, string> = {
  over: '已过期',
  today: '今天到期',
  tomorrow: '明天到期',
  week: '2–7 天',
  later: '更晚',
  none: '无到期日',
};

/** 展示顺序：最该处理的在最前，无到期日永远垫底（与分组视图 `GROUP_ORDER` 同向） */
export const BUCKET_ORDER: TimeBucket[] = ['over', 'today', 'tomorrow', 'week', 'later', 'none'];

/**
 * 单件 → 桶。
 *
 * - `warn`（不建议存放）与 `none`（未设保质期）都归到 `none` 桶，与 `groupOf` 的处理一致；
 * - `soon` / `fresh` 按剩余天数落桶，所以阈值改变时两个视图的表现是联动的。
 */
export function bucketOf(f: Pick<Freshness, 'state' | 'remainDays'>): TimeBucket {
  const d = f.remainDays;
  if (d === null) return 'none';
  if (d < 0) return 'over';
  if (d === 0) return 'today';
  if (d === 1) return 'tomorrow';
  if (d <= 7) return 'week';
  return 'later';
}

export interface TimeBucketBundle<T> {
  bucket: TimeBucket;
  label: string;
  items: T[];
}

/**
 * 把**已按新鲜度排好序**的列表切成带桶头的段落。
 *
 * 与 `groupByFreshness` 同样的两个约定：保持传入顺序、空桶自动跳过。
 * @param list 元素需带 `state` 与 `remainDays`（即 `Freshness` 的两个字段）
 * @example groupByTimeline([{ state: 'over', remainDays: -2 }, { state: 'fresh', remainDays: 20 }])
 * // → [{ bucket: 'over', label: '已过期', items: [over] },
 * //    { bucket: 'later', label: '更晚',  items: [fresh] }]
 */
export function groupByTimeline<T extends { state: FreshnessState; remainDays: number | null }>(
  list: T[],
): TimeBucketBundle<T>[] {
  const buckets = new Map<TimeBucket, T[]>();
  for (const it of list) {
    const b = bucketOf(it);
    const arr = buckets.get(b);
    if (arr) arr.push(it);
    else buckets.set(b, [it]);
  }
  return BUCKET_ORDER.filter((b) => buckets.has(b)).map((b) => ({
    bucket: b,
    label: BUCKET_LABEL[b],
    items: buckets.get(b) as T[],
  }));
}
