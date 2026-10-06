/**
 * 测试夹具：手搓领域对象。
 *
 * 只填「这个用例关心的字段」，其余走默认值 —— 用例里出现一个没见过的字段，
 * 说明它在悄悄影响结果，那才需要显式写出来。
 */
import type { Item, Location, ShoppingItem } from '../types';

const DAY = 86_400_000;

/** 相对某个基准时刻的第 n 天（YYYY-MM-DD） */
export function ds(n: number, base = Date.UTC(2026, 9, 5)): string {
  return new Date(base + n * DAY).toISOString().slice(0, 10);
}

export const TODAY = ds(0);
export const NOW = Date.UTC(2026, 9, 5) + 12 * 3_600_000;

export interface ItemSeed {
  id?: string;
  name?: string;
  /** 相对今天的到期日偏移；null = 无到期日 */
  expireIn?: number | null;
  qty?: number;
  unit?: string;
  price?: number | null;
  loc?: string;
  status?: Item['status'];
  deletedAt?: number | null;
  snoozeUntil?: number | null;
  dictKey?: string | null;
  category?: Item['category'];
  manualShelfLife?: number | null;
  notRecommended?: boolean;
  storedAt?: string;
  producedAt?: string | null;
  createdAt?: number;
}

export function mkItem(s: ItemSeed = {}): Item {
  return {
    id: s.id ?? 'i1',
    name: s.name ?? '测试物资',
    dictKey: s.dictKey ?? null,
    // ⚠️ 这里不能用 `s.category ?? 'vegetable'`：`category` 允许显式传 `null`
    // （自定义食材没有品类，统计页要靠这个走「其他」分支），`??` 会把 null 吞掉，
    // 于是「无品类」这条永远测不到，测试通过但功能是坏的。
    category: s.category === undefined ? 'vegetable' : s.category,
    icon: '测',
    quantity: s.qty ?? 1,
    unit: s.unit ?? '个',
    price: s.price ?? null,
    locationId: s.loc ?? 'L1',
    storedAt: s.storedAt ?? TODAY,
    producedAt: s.producedAt ?? null,
    expireAt: s.expireIn === null ? null : s.expireIn === undefined ? ds(3) : ds(s.expireIn),
    shelfLifeDays: 7,
    shelfLifeSource: 'builtin',
    manualShelfLife: s.manualShelfLife ?? null,
    notRecommended: s.notRecommended ?? false,
    notRecommendedReason: null,
    status: s.status ?? 'in_stock',
    note: null,
    snoozeUntil: s.snoozeUntil ?? null,
    createdAt: s.createdAt ?? NOW,
    updatedAt: NOW,
    deletedAt: s.deletedAt ?? null,
  };
}

export function mkLocation(id: string, name: string, env: Location['env'], sort: number, enabled = true): Location {
  return {
    id,
    name,
    icon: name.slice(0, 1),
    env,
    sort,
    enabled,
    builtin: true,
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: null,
  };
}

export interface ShopSeed {
  id?: string;
  name?: string;
  qty?: number | null;
  unit?: string | null;
  loc?: string | null;
}

export function mkShopping(s: ShopSeed = {}): ShoppingItem {
  return {
    id: s.id ?? 's1',
    name: s.name ?? '测试物资',
    quantity: s.qty ?? null,
    unit: s.unit ?? null,
    locationId: s.loc ?? null,
    reason: 'manual',
    sourceItemId: null,
    checked: true,
    checkedAt: NOW,
    auto: false,
    dismissedUntil: null,
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: null,
  };
}

/** 默认的提醒阈值：紧急 ≤3 天、临期 ≤14 天 */
export const SETTINGS = { urgentDays: 3, soonDays: 14 };
