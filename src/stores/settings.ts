import { defineStore } from 'pinia';
import { ref } from 'vue';
import { db } from '@/data';
import { DEFAULT_SETTINGS, type Settings } from '@/domain/types';

export const useSettingsStore = defineStore('settings', () => {
  const settings = ref<Settings>({ ...DEFAULT_SETTINGS, createdAt: Date.now(), updatedAt: Date.now() });
  const loaded = ref(false);

  /**
   * 从本地存储读取设置。repository 保证记录缺失时自动写入默认设置，
   * 因此**返回值永不为空**，UI 不需要处理 undefined。
   */
  async function load() {
    settings.value = await db.settings.get();
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
    settings.value = { ...settings.value, ...p, updatedAt: Date.now() };
    await db.settings.save(settings.value);
  }

  return { settings, loaded, load, patch };
});
