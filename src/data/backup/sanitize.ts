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

import type { ConsumeLog, DictEntry, EnvType, Item, Location, ShelfLifeValue, ShoppingItem } from '@/domain/types';
import { NOT_RECOMMENDED } from '@/domain/types';
import { isDateStr, parseDate, toDateStr } from '@/domain/dates';
// 金额口径复用 domain/price：`null`=没填价、必须有限非负的规则只有那一份定义。
// 早期这里只校验了日志侧的 price，物品侧原样穿透 —— 就是漏了这一行 import。
import { normalizePrice } from '@/domain/price';
import { normalizeName } from '@/domain/normalize';

/** 合法的环境枚举（位置的配色与保质期链都按它查表，非法值会让查询落空） */
const KNOWN_ENV = new Set<string>(['chilled', 'frozen', 'cool', 'dry', 'ventilated', 'dark', 'none']);

// 日期格式判断住在 `domain/dates`（纯函数、不碰数据源），
// 与 `normalizeName` 当初从 data 迁到 domain 是同一回事：data 可以依赖 domain，反之不行。

/**
 * 日期**往返校验**：格式合法且 `toDateStr(parseDate(v)) === v`。
 *
 * 只查格式挡不住 `'2026-13-01'` / `'2026-02-31'`——`parseDate` 会把它们归一成
 * 2027-01-01 / 03-03 静默进库，卡片显示「到期日 13-01」这种鬼日期（REV-48）。
 * 往返一致才说明是真实存在的日历日。
 */
function validDate(v: unknown): v is string {
  if (!isDateStr(v)) return false;
  return toDateStr(parseDate(v)) === v;
}

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

/**
 * 时间戳归一：`null` / `undefined` → `fallback`（缺失不算脏）；其它非法值 → `fallback` + 计一次修正。
 *
 * ⚠️ 这不是洁癖：`createdAt` / `updatedAt` 是合并导入的**排序键**
 * （`mergeById` 用 `updatedAt ?? createdAt` 取较新者），`"2026-10-01"` 或 `NaN` 会让
 * 比较恒为 `false`，本地旧数据就永远压过备份里的新数据。
 */
function epoch(v: unknown, fallback: number, onFixed: () => void): number {
  if (v == null) return fallback;
  if (typeof v === 'number' && Number.isFinite(v) && v > 0) return v;
  onFixed();
  return fallback;
}

/**
 * 软删时间戳：`null` / `undefined` → `null`；非法值（`"0"`、负数、字符串）→ `null` + 计一次修正。
 *
 * ⚠️ 仓库层用 `!r.deletedAt` 过滤，而字符串 `"0"` 是**真值** —— 不清洗的话这条记录
 * 会永久隐身，用户还看到 `dropped: 0 fixed: 0`，无从查证。
 */
function deletedAtOf(v: unknown, onFixed: () => void): number | null {
  if (v == null) return null;
  if (typeof v === 'number' && Number.isFinite(v) && v > 0) return v;
  onFixed();
  return null;
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
 * - 缺 `id` / 空 `name` 的整条丢弃（UI 无法呈现）；`status` 非法回落 `in_stock` 并计数。
 * - 日期走 `validDate` 往返校验（格式对但日历上不存在的日子也按非法处理）。
 * - 数量：有限**非负**数原样保留 —— `0` 是用户「明确清空」的语义，改成 1 会凭空造库存（REV-49）；
 *   负数 / NaN / 字符串等非法值归 1 并计 `fixed`。
 * - `name` 落库前 `trim()`：判空用的是 trim 后的值，入库却带首尾空白会让名称匹配永久失灵。
 * - `deletedAt` 归一：仓库层用 `!r.deletedAt` 过滤，字符串 `"0"` 是真值 → 记录永久隐身。
 * @param fallbackDate 记录缺 `storedAt` 时补的日期（一般是导入当天的 'YYYY-MM-DD'）
 * @param now 缺 `createdAt` / `updatedAt` 时补的时间戳（测试传入固定值）
 */
export function sanitizeItems(input: unknown[], fallbackDate: string, now: number = Date.now()): SanitizeResult<Item> {
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
    const trimmedName = name.trim();
    if (trimmedName !== name) fixed++;

    const before = o.storedAt;
    // 用 `const` 一次算完：`let` + 分支里重新赋值会让 TS 在对象字面量处丢失类型收窄
    const storedAt: string = validDate(before) ? before : (fixed++, fallbackDate);
    const rawExpire = o.expireAt;
    const expireAt: string | null =
      rawExpire === null ? null : validDate(rawExpire) ? rawExpire : (fixed++, null);
    const rawProduced = o.producedAt ?? null;
    const producedAt: string | null =
      rawProduced === null ? null : validDate(rawProduced) ? rawProduced : (fixed++, null);

    const rawQty = o.quantity;
    const goodQty = typeof rawQty === 'number' && Number.isFinite(rawQty) && rawQty >= 0;
    if (rawQty !== undefined && !goodQty) fixed++;
    const status: Item['status'] = o.status === 'finished' ? 'finished' : 'in_stock';
    if (o.status !== undefined && o.status !== status) fixed++;

    // 单价：有限非负数，否则置 null（「没填价」不能被当成「免费 0 元」）
    const price = normalizePrice(o.price);
    fixed += moneyFixed(o.price, price);
    const note = typeof o.note === 'string' ? o.note : null;
    if (o.note != null && note !== o.note) fixed++;
    const createdAt = epoch(o.createdAt, now, () => fixed++);

    rows.push({
      ...(o as unknown as Item),
      id,
      name: trimmedName,
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
      createdAt,
      updatedAt: epoch(o.updatedAt, createdAt, () => fixed++),
      deletedAt: deletedAtOf(o.deletedAt, () => fixed++),
    });
  }
  return { rows, dropped, fixed };
}

/** 消耗日志清洗：只保日期与数值字段合法（明细页与统计都直接用它们）。数量规则与物品侧一致（0 保留）。 */
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
    const trimmedName = name.trim();
    if (trimmedName !== name) fixed++;
    let at = num(o.at, NaN);
    if (!Number.isFinite(at) || at <= 0) {
      at = Date.now();
      fixed++;
    }
    const rawExpire = o.expireAt ?? null;
    const expireAt: string | null =
      rawExpire === null ? null : validDate(rawExpire) ? rawExpire : (fixed++, null);
    const rawQty = o.quantity;
    const goodQty = typeof rawQty === 'number' && Number.isFinite(rawQty) && rawQty >= 0;
    if (rawQty !== undefined && !goodQty) fixed++;
    const type: ConsumeLog['type'] = o.type === 'wasted' ? 'wasted' : 'consumed';
    if (o.type !== undefined && o.type !== type) fixed++;

    const price = normalizePrice(o.price);
    fixed += moneyFixed(o.price, price);
    // 单价快照同理：明细页 `money()` 只挡 null/undefined，字符串会走到 `.toFixed` 抛错白屏
    const unitPrice = normalizePrice(o.unitPrice);
    fixed += moneyFixed(o.unitPrice, unitPrice);
    const note = typeof o.note === 'string' ? o.note : null;
    if (o.note != null && note !== o.note) fixed++;
    const createdAt = epoch(o.createdAt, at, () => fixed++);

    rows.push({
      ...(o as unknown as ConsumeLog),
      id,
      name: trimmedName,
      at,
      createdAt,
      quantity: goodQty ? rawQty : 1,
      type,
      expireAt,
      unit: str(o.unit, '个') || '个',
      locationId: str(o.locationId, ''),
      price,
      unitPrice,
      note,
      deletedAt: deletedAtOf(o.deletedAt, () => fixed++),
    });
  }
  return { rows, dropped, fixed };
}

/** 位置清洗：`sort` 非数字会让位置管理页的排序错乱，`env` 非法会让配色查询拿不到值 */
export function sanitizeLocations(input: unknown[], now: number = Date.now()): SanitizeResult<Location> {
  const rows: Location[] = [];
  let dropped = 0;
  let fixed = 0;
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
    const createdAt = epoch(o.createdAt, now, () => fixed++);
    rows.push({
      ...(o as unknown as Location),
      id: o.id,
      name: str(o.name, '未命名位置') || '未命名位置',
      env,
      sort: Number.isFinite(sort) ? sort : 999,
      enabled: o.enabled !== false,
      createdAt,
      updatedAt: epoch(o.updatedAt, createdAt, () => fixed++),
      deletedAt: deletedAtOf(o.deletedAt, () => fixed++),
    });
  }
  return { rows, dropped, fixed };
}

/** 清单项清洗：`locationId` 脏值会让「按位置分组」把它塞进错误的位置桶 */
export function sanitizeShopping(input: unknown[], now: number = Date.now()): SanitizeResult<ShoppingItem> {
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
    const createdAt = epoch(o.createdAt, now, () => fixed++);
    const trimmedName = o.name.trim();
    if (trimmedName !== o.name) fixed++;
    rows.push({
      ...(o as unknown as ShoppingItem),
      id: o.id,
      name: trimmedName,
      reason,
      locationId,
      createdAt,
      updatedAt: epoch(o.updatedAt, createdAt, () => fixed++),
      deletedAt: deletedAtOf(o.deletedAt, () => fixed++),
    });
  }
  return { rows, dropped, fixed };
}

/**
 * 自定义字典清洗。
 *
 * ⚠️ 这里是**白屏级**防线：`stores/dict` 的 `buildCustomMap` 会对每条记录的
 * `dictKey` 调 `normalizeName`（内部 `.trim()`），一旦 `dictKey` 是数字 / `null`，
 * `map` 这个 computed 就抛 TypeError —— 物品编辑、快速入库、扫码、清单行内入库
 * **四处页面一起永久白屏**，重启也一样，而数据只在本机、没有副本可回滚。
 *
 * 规则：
 * - 缺 `id`、缺可用 `dictKey`、`days` 不是「正整数或 -1（不建议）」→ **整条丢弃**并计数；
 *   做不到「猜一个天数」—— 猜错等于给用户错误保质期，比丢掉这条规则更糟。
 * - `dictKey` 用 `normalizeName` 归一（与运行时索引键一致）；`env` 非法回落 `cool`；
 * - 同 `dictKey|env` 只保留**最后一条**（导入顺序靠后视为用户的新意图）。
 *
 * @param now 缺 `createdAt` / `updatedAt` 时补的时间戳
 */
export function sanitizeDict(input: unknown[], now: number = Date.now()): SanitizeResult<DictEntry> {
  const byKey = new Map<string, DictEntry>();
  let dropped = 0;
  let fixed = 0;

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
    const rawKey = o.dictKey;
    const dictKey = typeof rawKey === 'string' ? normalizeName(rawKey) : '';
    if (!dictKey) {
      dropped++;
      continue;
    }
    if (rawKey !== dictKey) fixed++;

    const days = o.days;
    const goodDays = typeof days === 'number' && Number.isFinite(days) && (days === NOT_RECOMMENDED || days > 0);
    if (!goodDays) {
      dropped++;
      continue;
    }

    const env: EnvType = typeof o.env === 'string' && KNOWN_ENV.has(o.env) ? (o.env as EnvType) : (fixed++, 'cool');
    const displayName =
      typeof o.displayName === 'string' && o.displayName.trim() ? o.displayName.trim() : dictKey;
    if (o.displayName !== undefined && displayName !== o.displayName) fixed++;
    const reason = typeof o.reason === 'string' ? o.reason : null;
    if (o.reason != null && reason !== o.reason) fixed++;
    const createdAt = epoch(o.createdAt, now, () => fixed++);

    const row: DictEntry = {
      id: o.id,
      dictKey,
      displayName,
      env,
      days: days as ShelfLifeValue,
      reason,
      // 导入的条目一律是自定义规则（内置字典在代码里，不进备份）
      origin: 'custom',
      createdAt,
      updatedAt: epoch(o.updatedAt, createdAt, () => fixed++),
      deletedAt: deletedAtOf(o.deletedAt, () => fixed++),
    };

    const slot = `${dictKey}|${env}`;
    if (byKey.has(slot)) {
      dropped++;
      fixed++;
    }
    byKey.delete(slot);
    byKey.set(slot, row);
  }
  return { rows: Array.from(byKey.values()), dropped, fixed };
}
