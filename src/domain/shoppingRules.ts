import type { ConsumeLog, Item, ShopReason, ShoppingItem, Settings } from './types';
import { freshnessOf } from './freshness';
import { todayStr } from './dates';

export interface Suggestion {
  name: string;
  reason: ShopReason;
  why: string;
  sourceItemId: string | null;
  locationId: string | null;
  unit: string | null;
}

const DAY = 24 * 60 * 60 * 1000;
const DISMISS_DAYS = 7;

function activeItems(items: Item[]): Item[] {
  return items.filter((i) => !i.deletedAt && i.status === 'in_stock');
}

/**
 * 自动生成购物建议（幂等：反复调用不产生重复项）。
 * 规则：① 近 60 天消耗过但当前无在库 → 库存 0
 *      ② 当前处于紧急/已过期 → 临期替换
 *      ③ 近 90 天丢弃 ≥ 2 次 → 易浪费
 */
export function planShopping(
  items: Item[],
  logs: ConsumeLog[],
  existing: ShoppingItem[],
  now: number = Date.now(),
  settings: Pick<Settings, 'soonDays' | 'urgentDays'> = { soonDays: 14, urgentDays: 3 },
): Suggestion[] {
  const today = todayStr(now);
  const live = activeItems(items);
  const logs60 = logs.filter((l) => !l.deletedAt && l.type === 'consumed' && now - l.at <= 60 * DAY);
  const logs90 = logs.filter((l) => !l.deletedAt && l.type === 'wasted' && now - l.at <= 90 * DAY);

  const out: Suggestion[] = [];
  const seen = new Set<string>();

  const push = (s: Suggestion) => {
    const key = `${s.name}|${s.reason}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(s);
  };

  // ① 库存 0
  const inStockNames = new Set(live.map((i) => i.name));
  for (const l of logs60) {
    if (inStockNames.has(l.name)) continue;
    push({ name: l.name, reason: 'out_of_stock', why: '库存 0', sourceItemId: null, locationId: l.locationId, unit: l.unit });
  }

  // ② 临期替换
  for (const it of live) {
    const f = freshnessOf(it, today, settings);
    if (f.state === 'urgent' || f.state === 'over') {
      push({ name: it.name, reason: 'near_expiry', why: '临期替换', sourceItemId: it.id, locationId: it.locationId, unit: it.unit });
    }
  }

  // ③ 易浪费
  const wasteCount = new Map<string, number>();
  for (const l of logs90) wasteCount.set(l.name, (wasteCount.get(l.name) ?? 0) + 1);
  for (const [name, cnt] of wasteCount) {
    if (cnt >= 2) {
      push({ name, reason: 'frequent_waste', why: `近 90 天扔掉 ${cnt} 次 · 建议少买`, sourceItemId: null, locationId: null, unit: null });
    }
  }

  // 幂等过滤：已存在同 name+reason 的未删除项跳过；被手动删除的 7 天内不重生
  const exists = new Set(
    existing.filter((e) => !e.deletedAt).map((e) => `${e.name}|${e.reason}`),
  );
  const dismissed = new Set(
    existing
      .filter((e) => e.deletedAt && e.dismissedUntil && e.dismissedUntil > now)
      .map((e) => `${e.name}|${e.reason}`),
  );

  return out.filter((s) => {
    const key = `${s.name}|${s.reason}`;
    return !exists.has(key) && !dismissed.has(key);
  });
}

export const REASON_LABEL: Record<ShopReason, string> = {
  out_of_stock: '库存 0',
  near_expiry: '临期替换',
  frequent_waste: '易浪费',
  manual: '手动添加',
};
