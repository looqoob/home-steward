import { defineStore } from 'pinia';
import { ref } from 'vue';
import { db } from '@/data';
import { normalizeSettings } from '@/domain/settings';
import { DEFAULT_SETTINGS, type Settings } from '@/domain/types';

export const useSettingsStore = defineStore('settings', () => {
  const settings = ref<Settings>({ ...DEFAULT_SETTINGS, createdAt: Date.now(), updatedAt: Date.now() });
  const loaded = ref(false);

  /**
   * 从本地存储读取设置。repository 保证记录缺失时自动写入默认设置，
   * 因此**返回值永不为空**，UI 不需要处理 undefined。
   *
   * ⚠️ 归一化规则住在 `domain/settings.ts`，与备份导入共用 —— 别在这里再写一份
   * （两条路径漂移就会出现「导入后提醒设置静默不生效」这类问题）。
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
