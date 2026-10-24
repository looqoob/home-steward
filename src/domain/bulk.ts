/**
 * 批量操作的规划逻辑（纯函数）。
 *
 * 场景：清理冰箱 / 换季，十几件要一起处理，逐件点太慢。
 * 本模块只负责**算出该写什么**，不碰数据库；落库由 `stores/items` 完成。
 */

import type { ConsumeLog, ConsumeType, EnvType, Item } from './types';
import type { ShelfLifeResolver } from './shelfLife';
import { computeExpiry } from './shelfLife';
import { newId } from './ids';
import { diffDays, todayStr, isDateStr } from './dates';
import { amountOf, normalizePrice } from './price';

export type BulkKind = 'consume' | 'move' | 'remove' | 'price';

/**
 * 一次批量操作的快照，供撤销使用。
 *
 * ⚠️ 只存在内存（`stores/items` 的模块级 Map），**不落库**：
 * 撤销入口只在 Toast 上存在 5 秒，为它建表不值得；刷新页面后撤销失效是可接受的。
 */
export interface BulkOp {
  id: string;
  kind: BulkKind;
  /** kind === 'consume' 时有效 */
  consumeType?: ConsumeType;
  /** 操作前的商品快照，撤销时整条写回 */
  items: Item[];
  /** kind === 'consume' 时新产生的日志 id，撤销时硬删除 */
  logIds: string[];
  createdAt: number;
}

function activeOnly(items: Item[]): Item[] {
  return items.filter((i) => !i.deletedAt && i.status === 'in_stock' && i.quantity > 0);
}

/**
 * 构造消耗日志。
 *
 * ⚠️ **全项目只有这一份实现**：`stores/items.consume`、`domain/bulk.planBulkConsume`、
 * `domain/grouping.planGroupConsume` 都调它。写第二份就一定会漂移——
 * 漂移的表现是「明细页的金额和本月统计对不上」，而且极难排查。
 *
 * @param take 本次消耗数量（已钳到 `(0, item.quantity]`）
 * @param today 'YYYY-MM-DD'，用于算 `overdueDays`
 */
export function buildConsumeLog(item: Item, type: ConsumeType, take: number, today: string, now: number): ConsumeLog {
  let overdueDays: number | null = null;
  // ⚠️ 与 freshnessOf 同款 isDateStr 兜底：只判 `item.expireAt` 真值会让数字 / 对象等脏值穿透，
  // 随后 diffDays → parseDate 执行 .split() 时抛 TypeError，整条 consume 失败。
  if (isDateStr(item.expireAt)) {
    const d = diffDays(item.expireAt, today);
    overdueDays = d < 0 ? -d : 0;
  }
  return {
    id: newId(),
    itemId: item.id,
    name: item.name,
    quantity: take,
    unit: item.unit,
    locationId: item.locationId,
    type,
    // Item.price 是单价，日志记「本次金额」，否则「扔掉 2 个」会算成整份的钱。
    // 走 domain/price 的 amountOf：金额口径只有那一份实现，不要在这里再拼一遍。
    price: amountOf(item.price, take),
    unitPrice: normalizePrice(item.price),
    note: item.note ?? null,
    expireAt: item.expireAt,
    overdueDays,
    at: now,
    createdAt: now,
    deletedAt: null,
  };
}

export interface BulkConsumePlan {
  logs: ConsumeLog[];
  items: Item[];
}

/**
 * 规划批量消耗：**每件各自清空自己的剩余量**。
 *
 * 与逐条 `consume()` 的语义一致：全清 → `status` 置 `'finished'` 且 `quantity` 保留原值
 * （供日志对账，撤销时才能正确回加）；不足清空的情况这里不会出现，因为按剩余量取。
 *
 * @returns 新建日志 + 更新后的商品完整对象（调用方 bulkPut）
 */
export function planBulkConsume(
  items: Item[],
  type: ConsumeType,
  now: number = Date.now(),
): BulkConsumePlan {
  const today = todayStr(now);
  const logs: ConsumeLog[] = [];
  const out: Item[] = [];
  for (const it of activeOnly(items)) {
    const take = it.quantity;
    logs.push(buildConsumeLog(it, type, take, today, now));
    out.push({ ...it, status: 'finished', updatedAt: now });
  }
  return { logs, items: out };
}

/**
 * 规划批量换位置：**逐件重算到期日**，入库日期 `storedAt` 保持不变。
 *
 * 直接复用 `computeExpiry` 而不是自己算一遍：它已经处理了「环境为 none 不计保质期」
 * 与「字典返回 NOT_RECOMMENDED」两个分支，自己重写必然漏掉其中之一，
 * 导致批量换位置与逐条 `items.moveTo` 的结果不一致。
 *
 * 手填保质期（`manualShelfLife`）优先级最高，切换位置不会被内置字典覆盖。
 */
export function planBulkMove(
  items: Item[],
  locationId: string,
  env: EnvType,
  resolve: ShelfLifeResolver,
  fallback: (env: EnvType, category: Item['category']) => number | null,
  now: number = Date.now(),
): Item[] {
  const out: Item[] = [];
  for (const it of activeOnly(items)) {
    // §5.7 契约：进 computeExpiry 的日期必须是合法 YYYY-MM-DD，否则 addDays → parseDate
    // 会在 `.split` 上抛 TypeError，一脏全批失败。脏值按「入库日缺失 → 今天 / 生产日非法 → 忽略」处理。
    const storedAt = isDateStr(it.storedAt) ? it.storedAt : todayStr(now);
    const producedAt = isDateStr(it.producedAt) ? it.producedAt : null;
    const r = computeExpiry(
      {
        name: it.name,
        category: it.category,
        storedAt,
        producedAt,
        manualShelfLife: it.manualShelfLife,
      },
      env,
      resolve,
      fallback,
    );
    out.push({
      ...it,
      locationId,
      expireAt: r.expireAt,
      shelfLifeDays: r.days,
      shelfLifeSource: r.source,
      notRecommended: r.notRecommended,
      notRecommendedReason: r.reason,
      updatedAt: now,
    });
  }
  return out;
}

/** 规划批量删除：软删除，不写消耗日志（与逐条 `items.remove` 语义一致） */
export function planBulkRemove(items: Item[], now: number = Date.now()): Item[] {
  return items
    .filter((i) => !i.deletedAt)
    .map((i) => ({ ...i, deletedAt: now, updatedAt: now }));
}
