/**
 * 设置的「归一化」：把**任何来源**（旧 IndexedDB 记录、用户手改过的备份 JSON、
 * 未来新增字段的旧数据）的 Settings 变成一份字段齐全、值域合法的对象。
 *
 * ## 为什么住在 domain
 *
 * 备份导入（`data/backup/import.ts`）与 store 加载（`stores/settings.ts`）都必须
 * 经过同一套白名单校验。若各自写一份，两条路径的回落规则迟早漂移 ——
 * 而导入路径**不经过 store**（直接 `db.settings.save()`），漏掉校验就会把
 * `id: "x"` 写成一行永远读不到的垃圾记录、把 `"remindEnabled": "false"` 当真值。
 *
 * `data` 可以依赖 `domain`，反之不行，所以规则只能放在这里。
 *
 * ## 三条硬规则
 *
 * 1. `id` 恒为 `'singleton'`（仓库层只按这个 key 读）。
 * 2. 布尔字段用 `typeof === 'boolean'` 判定 —— 字符串 `"false"` 是**真值**，
 *    用 `if (raw.remindEnabled)` 会让关闭提醒的用户继续收到通知。
 * 3. 数值字段（天数 / 时刻）越界一律回落默认，绝不裸读。
 */
import { normalizeHex } from './accent';
import { DEFAULT_SETTINGS, type Settings, type StockViewMode, type ThemeMode } from './types';

/** 数值兜底：非有限数 / 越界 → `fallback` */
function clampNum(v: unknown, lo: number, hi: number, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? v : fallback;
}

/** 时间戳兜底：非有限正数 → `fallback`（0 / 字符串 / NaN 都不算「有效时间」） */
function epoch(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : fallback;
}

/** 可空时间戳：`null` / `undefined` 保持 `null`，非法值也归 `null` */
function epochOrNull(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null;
}

/**
 * 把任意来源的原始设置归一成合法 `Settings`。
 *
 * @param raw 数据库记录 / 备份 JSON 里的设置对象（可能是 `undefined`、缺字段、类型错）
 * @param now 缺 `createdAt` / `updatedAt` 时补的时间戳；测试里固定传入以保证确定性
 * @returns 字段齐全且值域合法的设置
 * @example normalizeSettings({ remindEnabled: 'false', soonDays: 999 })
 *          // → { remindEnabled: true（类型不对回落默认）, soonDays: 14, id: 'singleton', … }
 */
export function normalizeSettings(raw: unknown, now: number = Date.now()): Settings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;

  const mode: ThemeMode =
    r.themeMode === 'light' || r.themeMode === 'dark' || r.themeMode === 'system'
      ? r.themeMode
      : DEFAULT_SETTINGS.themeMode;
  const stockViewMode: StockViewMode =
    r.stockViewMode === 'timeline' || r.stockViewMode === 'flat' || r.stockViewMode === 'group'
      ? r.stockViewMode
      : DEFAULT_SETTINGS.stockViewMode;

  // urgentDays 的上界依赖 soonDays：先算 soonDays，再夹 urgentDays
  const soonDays = clampNum(r.soonDays, 1, 365, DEFAULT_SETTINGS.soonDays);
  const urgentDays = clampNum(r.urgentDays, 0, soonDays, DEFAULT_SETTINGS.urgentDays);
  const createdAt = epoch(r.createdAt, now);

  return {
    id: 'singleton',
    schemaVersion: DEFAULT_SETTINGS.schemaVersion,
    dictVersion: DEFAULT_SETTINGS.dictVersion,
    remindEnabled:
      typeof r.remindEnabled === 'boolean' ? r.remindEnabled : DEFAULT_SETTINGS.remindEnabled,
    remindHour: clampNum(r.remindHour, 0, 23, DEFAULT_SETTINGS.remindHour),
    remindMinute: clampNum(r.remindMinute, 0, 59, DEFAULT_SETTINGS.remindMinute),
    soonDays,
    urgentDays,
    lastRemindAt: epochOrNull(r.lastRemindAt),
    lastBackupAt: epochOrNull(r.lastBackupAt),
    themeMode: mode,
    accent: normalizeHex(r.accent) ?? DEFAULT_SETTINGS.accent,
    stockViewMode,
    createdAt,
    updatedAt: epoch(r.updatedAt, createdAt),
  };
}
