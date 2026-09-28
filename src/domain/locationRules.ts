import type { Item, Location } from './types';

export interface DeleteCheck {
  ok: boolean;
  message: string;
}

/** 有在库物品的位置不允许删除，只能停用 */
export function canDeleteLocation(loc: Location, items: Item[]): DeleteCheck {
  const n = items.filter(
    (i) => i.locationId === loc.id && i.status === 'in_stock' && !i.deletedAt,
  ).length;
  if (n === 0) return { ok: true, message: '' };
  return { ok: false, message: `该位置还有 ${n} 件在库物品，请先移出或停用` };
}

export function countInLocation(locId: string, items: Item[]): number {
  return items.filter((i) => i.locationId === locId && i.status === 'in_stock' && !i.deletedAt).length;
}

export function nextSort(locations: Location[]): number {
  const max = locations.reduce((m, l) => Math.max(m, l.sort), 0);
  return max + 10;
}
