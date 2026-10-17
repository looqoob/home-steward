import { defineStore } from 'pinia';
import { ref } from 'vue';
import { db } from '@/data';
import { normalizeHex } from '@/domain/accent';
import { DEFAULT_SETTINGS, type Settings, type StockViewMode, type ThemeMode } from '@/domain/types';

/**
 * 补齐后加的字段。
 *
 * 主题相关字段（`themeMode` / `accent`）是后来加的，两类旧数据里没有：
 * ① 升级前已存在的 IndexedDB 记录；② 旧版本导出的备份 JSON（导入路径也会经过这里吗？——
 * 不会，导入直接 `db.settings.save()`，所以**备份导入后必须重新 `load()` 一次**）。
 * 缺字段时一律回落默认值，非法 hex 也回落默认色。
 *
 * `stockViewMode` 同理：v3 新增，旧记录与旧备份里是 `undefined`。
 * ⚠️ 新增任何设置字段都要在这里加回落 —— 否则旧用户读到 `undefined`，
 * 而 `StockView` 这类消费点如果直接裸读就会整个列表不渲染。
 *
 * 数值字段（`remindHour` / `remindMinute` / `soonDays` / `urgentDays`）此前直接穿透 `...raw`，
 * 脏数据（NaN / 负数 / 越界）会让提醒永久失效或新鲜度分类错乱。
 * 这里对每个数值字段加范围校验，非法值回落默认。
 */
function normalizeSettings(raw: Settings): Settings {
  const mode: ThemeMode =
    raw.themeMode === 'light' || raw.themeMode === 'dark' || raw.themeMode === 'system'
      ? raw.themeMode
      : DEFAULT_SETTINGS.themeMode;
  const stockViewMode: StockViewMode =
    raw.stockViewMode === 'timeline' || raw.stockViewMode === 'flat' || raw.stockViewMode === 'group'
      ? raw.stockViewMode
      : DEFAULT_SETTINGS.stockViewMode;
  // 数值字段校验：非有限数 / 越界 → 回落默认
  const clampNum = (v: unknown, lo: number, hi: number, fallback: number): number =>
    typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? v : fallback;
  const soonDays = clampNum(raw.soonDays, 1, 365, DEFAULT_SETTINGS.soonDays);
  const urgentDays = clampNum(raw.urgentDays, 0, soonDays, DEFAULT_SETTINGS.urgentDays);
  const remindHour = clampNum(raw.remindHour, 0, 23, DEFAULT_SETTINGS.remindHour);
  const remindMinute = clampNum(raw.remindMinute, 0, 59, DEFAULT_SETTINGS.remindMinute);
  return {
    ...raw,
    themeMode: mode,
    accent: normalizeHex(raw.accent) ?? DEFAULT_SETTINGS.accent,
    stockViewMode,
    soonDays,
    urgentDays,
    remindHour,
    remindMinute,
  };
}

export const useSettingsStore = defineStore('settings', () => {
  const settings = ref<Settings>({ ...DEFAULT_SETTINGS, createdAt: Date.now(), updatedAt: Date.now() });
  const loaded = ref(false);

  /**
   * 从本地存储读取设置。repository 保证记录缺失时自动写入默认设置，
   * 因此**返回值永不为空**，UI 不需要处理 undefined。
   */
  async function load() {
    settings.value = normalizeSettings(await db.settings.get());
    loaded.value = true;
  }

  /**
   * 局部更新设置并落库，自动刷新 `updatedAt`。
   *
   * ⚠️ `soonDays` / `urgentDays` 是 `freshnessOf` 的入参，改它们会让所有依赖
   * computed 的新鲜度显示即时变化（无需手动刷新）。
   *
   * @param p 要更新的字段（局部更新，不必先展开整个对象）
   * @example await settings.patch({ remindEnabled: true, remindHour: 20, remindMinute: 30 })
   */
  async function patch(p: Partial<Settings>) {
    // ⚠️ 先落库再改内存：此前先改内存后落库，若落库失败（Quota / IO）
    // 内存里是新值、DB 还是旧值，UI 显示新设置但重开 App 后回退到旧值。
    // 先落库则失败时内存不变，UI 与 DB 保持一致。
    const next = normalizeSettings({ ...settings.value, ...p, updatedAt: Date.now() });
    await db.settings.save(next);
    settings.value = next;
  }

  return { settings, loaded, load, patch };
});
