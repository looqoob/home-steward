import type { EnvType, Item, Location, ShelfLifeValue } from './types';
import { newId } from './ids';
import { todayStr } from './dates';
import { fallbackDays, guessCategory } from './categories';
import { computeExpiry, type ShelfLifeResolver } from './shelfLife';
import { normalizePrice } from './price';

export interface NewItemInput {
  name: string;
  quantity: number;
  unit: string;
  locationId: string;
  price?: number | null;
  storedAt?: string;
  producedAt?: string | null;
  manualShelfLife?: number | null;
  note?: string | null;
}

/** 由输入 + 位置创建物品，自动算到期日 */
export function createItem(
  input: NewItemInput,
  env: EnvType,
  resolve: ShelfLifeResolver,
  fallback: (env: EnvType, category: Item['category']) => number | null = fallbackDays,
  now: number = Date.now(),
  categoryHint: Item['category'] = null,
): Item {
  const storedAt = input.storedAt ?? todayStr(now);
  const name = input.name.trim();
  const category = categoryHint ?? guessCategory(name);
  const r = computeExpiry(
    { name, category, storedAt, producedAt: input.producedAt ?? null, manualShelfLife: input.manualShelfLife ?? null },
    env,
    resolve,
    fallback,
  );
  return {
    id: newId(),
    name,
    dictKey: name,
    category,
    icon: Array.from(name)[0] ?? '?',
    quantity: input.quantity,
    unit: input.unit,
    // 这是所有物品的**唯一诞生点**，价格口径在这里兜一次底：
    // 负数 / NaN / Infinity / 字符串（备份导入）一律落成 null，绝不让脏值进库污染月度统计
    price: normalizePrice(input.price),
    locationId: input.locationId,
    storedAt,
    producedAt: input.producedAt ?? null,
    expireAt: r.expireAt,
    shelfLifeDays: r.days,
    shelfLifeSource: r.source,
    manualShelfLife: input.manualShelfLife ?? null,
    notRecommended: r.notRecommended,
    notRecommendedReason: r.reason,
    status: 'in_stock',
    note: input.note ?? null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
}

/** 切换位置后重算到期日（入库日期不变），返回更新后的字段 */
export function recomputeForLocation(
  item: Item,
  env: EnvType,
  resolve: ShelfLifeResolver,
  fallback: (env: EnvType, category: Item['category']) => number | null,
): Pick<Item, 'expireAt' | 'shelfLifeDays' | 'shelfLifeSource' | 'notRecommended' | 'notRecommendedReason'> {
  const r = computeExpiry(
    {
      name: item.name,
      category: item.category,
      storedAt: item.storedAt,
      producedAt: item.producedAt,
      manualShelfLife: item.manualShelfLife,
    },
    env,
    resolve,
    fallback,
  );
  return {
    expireAt: r.expireAt,
    shelfLifeDays: r.days,
    shelfLifeSource: r.source,
    notRecommended: r.notRecommended,
    notRecommendedReason: r.reason,
  };
}

/**
 * 变更手填保质期并返回新的 Item 对象（不改原对象）。
 *
 * @param days 天数；`null` 或 ≤ 0 会归一化成 `null`（关闭手填，回落自动推算）。
 * @param env 当前所在位置的环境，决定重算时的兜底链。
 * @returns 新的 Item。**不落库**，持久化由 store 层负责。
 * @example
 * const next = applyManualShelfLife(item, 30, dict.resolve, fallbackDays, 'chilled');
 * await items.save(next);
 */
export function applyManualShelfLife(item: Item, days: number | null, resolve: ShelfLifeResolver, fallback: (env: EnvType, category: Item['category']) => number | null, env: EnvType) {
  const next: Item = { ...item, manualShelfLife: days && days > 0 ? days : null };
  return { ...next, ...recomputeForLocation(next, env, resolve, fallback) };
}

export function locationEnv(loc: Location | undefined): EnvType {
  return loc?.env ?? 'cool';
}

export type { ShelfLifeValue };
