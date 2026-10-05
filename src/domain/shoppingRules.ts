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
  /**
   * 建议数量。用于清单一键入库时预填 —— 用户上次买了 2 盒，这次大概率也是 2 盒。
   * 规则只能从日志推断「曾消耗过多少」，拿不到精确采购量，所以给 `null` 表示「未知」。
   */
  quantity: number | null;
}

const DAY = 24 * 60 * 60 * 1000;
const DISMISS_DAYS = 7;

function activeItems(items: Item[]): Item[] {
  return items.filter((i) => !i.deletedAt && i.status === 'in_stock');
}

/**
 * 名称 → 最近一次「用掉」的数量。
 *
 * 用途是给清单一键入库预填数量：上次买了 2 盒，这次大概率也是 2 盒。
 * 取的是**消耗**日志而非入库记录 —— 消耗日志更可能接近真实采购量
 * （买了 10 个鸡蛋分 4 次吃完，最后一次是 3，不够准但优于直接给 1）。
 */
function lastConsumedQty(logs: ConsumeLog[]): Map<string, number> {
  const latest = new Map<string, { at: number; qty: number }>();
  for (const l of logs) {
    if (l.deletedAt || l.type !== 'consumed') continue;
    const prev = latest.get(l.name);
    if (!prev || l.at >= prev.at) latest.set(l.name, { at: l.at, qty: l.quantity });
  }
  const out = new Map<string, number>();
  for (const [name, v] of latest) out.set(name, v.qty);
  return out;
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
  const lastQty = lastConsumedQty(logs);

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
    push({ name: l.name, reason: 'out_of_stock', why: '库存 0', sourceItemId: null, locationId: l.locationId, unit: l.unit, quantity: lastQty.get(l.name) ?? null });
  }

  // ② 临期替换
  for (const it of live) {
    const f = freshnessOf(it, today, settings);
    if (f.state === 'urgent' || f.state === 'over') {
      push({ name: it.name, reason: 'near_expiry', why: '临期替换', sourceItemId: it.id, locationId: it.locationId, unit: it.unit, quantity: it.quantity });
    }
  }

  // ③ 易浪费
  const wasteCount = new Map<string, number>();
  for (const l of logs90) wasteCount.set(l.name, (wasteCount.get(l.name) ?? 0) + 1);
  for (const [name, cnt] of wasteCount) {
    if (cnt >= 2) {
      push({ name, reason: 'frequent_waste', why: `近 90 天扔掉 ${cnt} 次 · 建议少买`, sourceItemId: null, locationId: null, unit: null, quantity: lastQty.get(name) ?? null });
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
