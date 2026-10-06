/**
 * 备份导入的**记录级清洗**（纯函数）。
 *
 * ## 为什么需要它
 *
 * `validateBackup` 只校验信封（应用名、版本号、数组在不在），记录本身**一条都不校验**，
 * 然后直接 `bulkPut` 进库。备份文件是纯 JSON、用户可以手改，也可能在传输中损坏 ——
 * 一条 `storedAt: 0` 就能让「我的」页和「库存」页**永久白屏**：
 *
 * ```
 * monthStats → monthKey(0)      → (0).slice is not a function
 * freshnessOf → diffDays(0, …) → parseDate(0) → (0).split is not a function
 * ```
 *
 * 而数据 100% 存在本机，没有云端副本可以回滚 —— 用户会发现自己既打不开应用、也换不回数据。
 * 所以**导入是唯一不可信数据进入应用的入口，清洗必须发生在这里**，
 * 而不是等到各个消费端到处加 `typeof` 防御（那样既漏又脏）。
 *
 * ## 原则
 *
 * - **能修的修**：日期不是合法 `YYYY-MM-DD` 就替换 / 置空，数量不是有限正数就归 1。
 *   丢数据比显示错数据更糟 —— 用户宁可看到一个空日期，也不愿自己的记录凭空消失。
 * - **修不了的丢**：没有 `id` 或 `name` 的记录无法在 UI 里呈现，丢掉并**如实计数上报**。
 * - **绝不静默**：清洗条数随导入结果一起返回，由界面告知用户（与「批量入库跳过项要告知」同一原则）。
 */

export { isDateStr } from '@/domain/dates';

import type { ConsumeLog, Item, Location, ShoppingItem } from '@/domain/types';
import { isDateStr } from '@/domain/dates';
// 金额口径复用 domain/price：`null`=没填价、必须有限非负的规则只有那一份定义。
// 早期这里只校验了日志侧的 price，物品侧原样穿透 —— 就是漏了这一行 import。
import { normalizePrice } from '@/domain/price';

// 日期格式判断住在 `domain/dates`（纯函数、不碰数据源），
// 与 `normalizeName` 当初从 data 迁到 domain 是同一回事：data 可以依赖 domain，反之不行。

function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function str(v: unknown, fallback: string): string {
  return typeof v === 'string' ? v : fallback;
}

/** 金额被修正过时计入 `fixed`（原值是 `undefined` / `null` 视为「本来就没填」，不算修正） */
function moneyFixed(raw: unknown, cleaned: number | null): 0 | 1 {
  return raw != null && cleaned !== raw ? 1 : 0;
}

/** 清洗结果：可用记录 + 各类被丢弃 / 被修正的条数 */
export interface SanitizeResult<T> {
  rows: T[];
  /** 整条丢弃（缺 id 或 name，无法呈现） */
  dropped: number;
  /** 字段被修正过（数据还在，但有值不合法） */
  fixed: number;
}

/**
 * 物品清洗。
 *
 * ⚠️ 丢 `status`：合并两种消耗状态会直接算错「在库」与浪费统计；宁可这条不进统计。
 * ⚠️ 丢 `deletedAt`：导入时上游已过滤，这里再滤一次是防御 `sanitizeLogs` 之外的路径。
 * @param fallbackDate 记录缺 `storedAt` 时补的日期（一般是导入当天的 'YYYY-MM-DD'）
 */
export function sanitizeItems(input: unknown[], fallbackDate: string): SanitizeResult<Item> {
  const rows: Item[] = [];
  let dropped = 0;
  let fixed = 0;

  for (const raw of input) {
    if (!raw || typeof raw !== 'object') {
      dropped++;
      continue;
    }
    const o = raw as Record<string, unknown>;
    const id = o.id;
    const name = o.name;
    if (typeof id !== 'string' || !id || typeof name !== 'string' || !name.trim()) {
      dropped++;
      continue;
    }

    const before = o.storedAt;
    // 用 `const` 一次算完：`let` + 分支里重新赋值会让 TS 在对象字面量处丢失类型收窄
    const storedAt: string = isDateStr(before) ? before : (fixed++, fallbackDate);
    const rawExpire = o.expireAt;
    const expireAt: string | null =
      rawExpire === null ? null : isDateStr(rawExpire) ? rawExpire : (fixed++, null);
    const rawProduced = o.producedAt ?? null;
    const producedAt: string | null =
      rawProduced === null ? null : isDateStr(rawProduced) ? rawProduced : (fixed++, null);

    const rawQty = o.quantity;
    const goodQty = typeof rawQty === 'number' && Number.isFinite(rawQty) && rawQty > 0;
    if (rawQty !== undefined && !goodQty) fixed++;
    const status: Item['status'] = o.status === 'finished' ? 'finished' : 'in_stock';
    if (o.status !== undefined && o.status !== status) fixed++;

    // 单价：有限非负数，否则置 null（「没填价」不能被当成「免费 0 元」）
    const price = normalizePrice(o.price);
    fixed += moneyFixed(o.price, price);
    const note = typeof o.note === 'string' ? o.note : null;
    if (o.note != null && note !== o.note) fixed++;

    rows.push({
      ...(o as unknown as Item),
      id,
      name,
      storedAt,
      expireAt,
      producedAt,
      quantity: goodQty ? rawQty : 1,
      status,
      price,
      note,
      // 这两个字段被列表按字符串用，非字符串会在渲染时炸掉
      locationId: str(o.locationId, ''),
      unit: str(o.unit, '个') || '个',
    });
  }
  return { rows, dropped, fixed };
}

/** 消耗日志清洗：只保日期与数值字段合法（明细页与统计都直接用它们） */
export function sanitizeLogs(input: unknown[]): SanitizeResult<ConsumeLog> {
  const rows: ConsumeLog[] = [];
  let dropped = 0;
  let fixed = 0;
  for (const raw of input) {
    if (!raw || typeof raw !== 'object') {
      dropped++;
      continue;
    }
    const o = raw as Record<string, unknown>;
    const id = o.id;
    const name = o.name;
    if (typeof id !== 'string' || !id || typeof name !== 'string' || !name.trim()) {
      dropped++;
      continue;
    }
    let at = num(o.at, NaN);
    if (!Number.isFinite(at) || at <= 0) {
      at = Date.now();
      fixed++;
    }
    const rawExpire = o.expireAt ?? null;
    const expireAt: string | null =
      rawExpire === null ? null : isDateStr(rawExpire) ? rawExpire : (fixed++, null);
    const rawQty = o.quantity;
    const goodQty = typeof rawQty === 'number' && Number.isFinite(rawQty) && rawQty > 0;
    if (!goodQty) fixed++;
    const type: ConsumeLog['type'] = o.type === 'wasted' ? 'wasted' : 'consumed';
    if (o.type !== undefined && o.type !== type) fixed++;

    const price = normalizePrice(o.price);
    fixed += moneyFixed(o.price, price);
    // 单价快照同理：明细页 `money()` 只挡 null/undefined，字符串会走到 `.toFixed` 抛错白屏
    const unitPrice = normalizePrice(o.unitPrice);
    fixed += moneyFixed(o.unitPrice, unitPrice);
    const note = typeof o.note === 'string' ? o.note : null;
    if (o.note != null && note !== o.note) fixed++;

    rows.push({
      ...(o as unknown as ConsumeLog),
      id,
      name,
      at,
      createdAt: num(o.createdAt, at),
      quantity: goodQty ? rawQty : 1,
      type,
      expireAt,
      unit: str(o.unit, '个') || '个',
      locationId: str(o.locationId, ''),
      price,
      unitPrice,
      note,
    });
  }
  return { rows, dropped, fixed };
}

/** 位置清洗：`sort` 非数字会让位置管理页的排序错乱，`env` 非法会让配色查询拿不到值 */
export function sanitizeLocations(input: unknown[]): SanitizeResult<Location> {
  const rows: Location[] = [];
  let dropped = 0;
  let fixed = 0;
  const KNOWN_ENV = new Set(['chilled', 'frozen', 'cool', 'dry', 'ventilated', 'dark', 'none']);
  for (const raw of input) {
    if (!raw || typeof raw !== 'object') {
      dropped++;
      continue;
    }
    const o = raw as Record<string, unknown>;
    if (typeof o.id !== 'string' || !o.id) {
      dropped++;
      continue;
    }
    const sort = num(o.sort, NaN);
    if (!Number.isFinite(sort)) fixed++;
    const env: Location['env'] =
      typeof o.env === 'string' && KNOWN_ENV.has(o.env) ? (o.env as Location['env']) : (fixed++, 'cool');
    rows.push({
      ...(o as unknown as Location),
      id: o.id,
      name: str(o.name, '未命名位置') || '未命名位置',
      env,
      sort: Number.isFinite(sort) ? sort : 999,
      enabled: o.enabled !== false,
    });
  }
  return { rows, dropped, fixed };
}

/** 清单项清洗：`locationId` 脏值会让「按位置分组」把它塞进错误的位置桶 */
export function sanitizeShopping(input: unknown[]): SanitizeResult<ShoppingItem> {
  const rows: ShoppingItem[] = [];
  let dropped = 0;
  let fixed = 0;
  const REASONS = new Set(['out_of_stock', 'near_expiry', 'frequent_waste', 'manual']);
  for (const raw of input) {
    if (!raw || typeof raw !== 'object') {
      dropped++;
      continue;
    }
    const o = raw as Record<string, unknown>;
    if (typeof o.id !== 'string' || !o.id || typeof o.name !== 'string' || !o.name.trim()) {
      dropped++;
      continue;
    }
    const reason: ShoppingItem['reason'] =
      typeof o.reason === 'string' && REASONS.has(o.reason)
        ? (o.reason as ShoppingItem['reason'])
        : (fixed++, 'manual');
    const rawLoc = o.locationId;
    const locationId: string | null = typeof rawLoc === 'string' && rawLoc ? rawLoc : null;
    if (rawLoc !== undefined && rawLoc !== locationId) fixed++;
    rows.push({
      ...(o as unknown as ShoppingItem),
      id: o.id,
      name: o.name,
      reason,
      locationId,
    });
  }
  return { rows, dropped, fixed };
}
