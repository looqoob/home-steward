import type { Item, Location } from './types';

export interface DeleteCheck {
  ok: boolean;
  message: string;
}

/**
 * 「某物品是否是该位置的在库物品」—— `canDeleteLocation` / `countInLocation` / `countsByLocation`
 * 共用的谓词。同一判定只允许有这一份：两个函数各写一遍 filter 条件，
 * 早晚会有一边改了另一边没跟（REV-50）。
 */
function inStockAt(i: Item, locId: string): boolean {
  return i.locationId === locId && i.status === 'in_stock' && !i.deletedAt;
}

/** 有在库物品的位置不允许删除，只能停用 */
export function canDeleteLocation(loc: Location, items: Item[]): DeleteCheck {
  const n = items.filter((i) => inStockAt(i, loc.id)).length;
  if (n === 0) return { ok: true, message: '' };
  return { ok: false, message: `该位置还有 ${n} 件在库物品，请先移出或停用` };
}


/**
 * 一次扫描算出**所有**位置的在库计数（`位置 id → 件数`，不含「未匹配到位置的」）。
 *
 * 位置管理页每行调一次 `countInLocation` 是 O(位置 × 物品)；位置十几件、
 * 物品几百件时每次重渲染都要几千次比较。列表页一律用这个一次聚合的版本（REV-35）。
 */
export function countsByLocation(items: Item[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const i of items) {
    if (i.status !== 'in_stock' || i.deletedAt) continue;
    m.set(i.locationId, (m.get(i.locationId) ?? 0) + 1);
  }
  return m;
}

export function nextSort(locations: Location[]): number {
  const max = locations.reduce((m, l) => Math.max(m, l.sort), 0);
  return max + 10;
}
