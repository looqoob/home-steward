/**
 * 日期一律用本地日期字符串 'YYYY-MM-DD'（不含时刻、不含时区），
 * 避免跨时区与夏令时导致的天数漂移。
 */

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * 判断是否为格式合法的日期字符串 `'YYYY-MM-DD'`（**只查格式，不查真实性**）。
 *
 * 存在的理由：外部数据（本机 IndexedDB 里的历史记录、用户导入的备份 JSON）不受 TS 类型保护，
 * 一次手滑或文件损坏就能让 `storedAt` 变成数字 `0`。而 `monthKey` / `parseDate` 都直接
 * `.slice` / `.split`，遇到这种值会抛错 —— 抛在**主 Tab** 上就是白屏，
 * 且数据只在本机、没有副本可回滚。所以在所有「外部数据 → 日期计算」的边界上先过一道这个判断。
 *
 * 2 月 31 日这类不存在的日期仍算合法（`parseDate` 会归一到 3 月），因为「判断真假日期」
 * 需要另一套历法校验，而这里的目的是防崩溃，不是防脏数据。
 *
 * @example isDateStr('2026-10-05') // true
 * @example isDateStr(20261005)      // false
 */
export function isDateStr(v: unknown): v is string {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

/**
 * Date → 本地日期字符串。
 * @example toDateStr(new Date(2026, 8, 29)) // '2026-09-29'
 */
export function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * 今天的日期字符串。
 * @param now epoch 毫秒，默认 `Date.now()`。传参便于测试与批量计算。
 * @example todayStr() // '2026-09-29'
 */
export function todayStr(now: number = Date.now()): string {
  return toDateStr(new Date(now));
}

/**
 * 'YYYY-MM-DD' → **本地零点**的 Date 对象。
 *
 * ⚠️ 不要用 `new Date('2026-09-29')`：那会按 UTC 解析，在东八区得到 08:00，
 * 进而让 `diffDays` 这类计算出现 ±1 天的漂移。
 * @param s 'YYYY-MM-DD'
 * @example parseDate('2026-09-29').getHours() // 0
 */
export function parseDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

/**
 * 日期加 n 天（n 可为负）。跨月跨年由 `Date.setDate` 的溢出进位保证正确。
 * @example addDays('2026-12-31', 1)  // '2027-01-01'
 * @example addDays('2026-03-01', -1) // '2026-02-28'
 */
export function addDays(s: string, n: number): string {
  const d = parseDate(s);
  d.setDate(d.getDate() + n);
  return toDateStr(d);
}

/**
 * 两个日期之间的自然日差，结果为 **`to - from`**（注意参数顺序）。
 *
 * 用 `Math.round` 而非整除：本地零点相减在夏令时切换日会得到 ±23/25 小时，
 * 取整后才能稳定得到整数天数。
 *
 * @param to 目标日期
 * @param from 基准日期
 * @returns 相差天数；`to` 早于 `from` 时为负数。
 * @example diffDays('2026-10-04', '2026-09-29') // 5
 * @example diffDays('2026-09-29', '2026-10-04') // -5
 */
export function diffDays(to: string, from: string): number {
  const MS = 24 * 60 * 60 * 1000;
  const a = parseDate(to).getTime();
  const b = parseDate(from).getTime();
  return Math.round((a - b) / MS);
}

/**
 * '2026-10-25' → '10-25'，用于卡片上省掉年份的短日期。
 * @example formatMD('2026-10-25') // '10-25'
 */
export function formatMD(s: string): string {
  const p = s.split('-');
  return `${p[1]}-${p[2]}`;
}

/**
 * '2026-10-25' → '2026-10'，月度分组键。
 * @example monthKey('2026-10-25') // '2026-10'
 */
export function monthKey(s: string): string {
  return s.slice(0, 7);
}

/**
 * epoch 毫秒 → 日期字符串。用于把时间戳字段（`ConsumeLog.at` 等）换算到日期维度。
 * @example fromEpoch(Date.now()) // '2026-09-29'
 */
export function fromEpoch(ms: number): string {
  return toDateStr(new Date(ms));
}

/**
 * 求「下一个」指定的每日时刻；若今天该时刻已过，返回明天同一时刻。
 *
 * @param hour 0–23
 * @param minute 0–59
 * @param now epoch 毫秒，默认 `Date.now()`
 * @returns 目标时刻的 epoch 毫秒（秒与毫秒归零）。
 * @example nextDailyAt(9, 0) // 今天已过 09:00 则返回明天 09:00
 */
export function nextDailyAt(hour: number, minute: number, now: number = Date.now()): number {
  // ⚠️ 校验 hour / minute：脏设置（NaN / 越界）会让 setHours 产生 Invalid Date，
  // getTime() 返回 NaN，提醒调度拿到 NaN 永远不触发。
  if (!Number.isFinite(hour) || hour < 0 || hour > 23) hour = 9;
  if (!Number.isFinite(minute) || minute < 0 || minute > 59) minute = 0;
  const d = new Date(now);
  d.setHours(hour, minute, 0, 0);
  if (d.getTime() <= now) d.setDate(d.getDate() + 1);
  return d.getTime();
}
