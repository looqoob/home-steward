<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { db } from '@/data';
import { ensureSeed } from '@/data/seed';
import { useSettingsStore } from '@/stores/settings';
import { useDictStore } from '@/stores/dict';
import { useLocationsStore } from '@/stores/locations';
import { useItemsStore } from '@/stores/items';
import { useShoppingStore } from '@/stores/shopping';
import { useBarcodesStore } from '@/stores/barcodes';
import { useToast } from '@/composables/useToast';
import { useReminder } from '@/composables/useReminder';
import { useTheme } from '@/composables/useTheme';

const settings = useSettingsStore();
const dict = useDictStore();
const locations = useLocationsStore();
const items = useItemsStore();
const shopping = useShoppingStore();
const barcodes = useBarcodesStore();
const reminder = useReminder();
const { message, action, runAction } = useToast();
const theme = useTheme();

const ready = ref(false);
const storageError = ref(false);
const bootError = ref('');

/**
 * 外观（深浅 + 主题色）的唯一落点：设置一变就重算色阶并写进 DOM。
 * `immediate` 保证首屏（还是默认值时）也会 apply 一次 —— 内联脚本只处理了深浅，
 * 主题色要等这里拿到 IndexedDB 里的设置才知道。
 *
 * ⚠️ 给 Vant 的 `appTheme` 是**解析后**的值（Vant 不认识 `system`）。
 */
const appTheme = theme.resolved;
watch(
  () => [settings.settings.themeMode, settings.settings.accent] as const,
  ([m, a]) => theme.sync(m, a),
  { immediate: true },
);

onMounted(async () => {
  try {
    const ok = await db.probe();
    if (!ok) {
      storageError.value = true;
      ready.value = true;
      return;
    }
    await ensureSeed(db);
    await Promise.all([
      settings.load(),
      dict.load(),
      locations.load(),
      items.load(),
      shopping.load(),
      // 条码映射：扫码时要立刻能查到历史映射，不能等到进管理页才加载
      barcodes.load(),
    ]);
    ready.value = true;
    await shopping.generate();
    await reminder.refresh();
  } catch (e) {
    bootError.value = (e as Error).message || '初始化失败';
    ready.value = true;
  }
});
</script>

<template>
  <van-config-provider :theme="appTheme">
    <div v-if="!ready" class="flex flex-col bg-page h-full w-full max-w-[480px] mx-auto relative items-center justify-center">
      <div class="text-[13px] text-ink-3">正在准备本地数据…</div>
    </div>

    <div v-else-if="storageError" class="flex flex-col bg-page h-full w-full max-w-[480px] mx-auto relative">
      <div class="flex items-center justify-between h-12 px-4 bg-card border-b border-line flex-none">
        <h2 class="text-[17px] font-semibold">无法使用本地存储</h2>
      </div>
      <div class="flex-1 overflow-y-auto px-4 pt-4 pb-2 no-scrollbar">
        <div class="text-[12px] text-ink-2 bg-soon-bg text-soon-fg rounded-md p-2.5 leading-relaxed">
          浏览器/系统禁用了本地数据库（IndexedDB），数据无法保存。请关闭无痕模式、允许站点数据后重试；
          若使用国产 WebView，建议改用 APK 版本。
        </div>
      </div>
    </div>

    <div v-else-if="bootError" class="flex flex-col bg-page h-full w-full max-w-[480px] mx-auto relative">
      <div class="flex items-center justify-between h-12 px-4 bg-card border-b border-line flex-none">
        <h2 class="text-[17px] font-semibold">初始化失败</h2>
      </div>
      <div class="flex-1 overflow-y-auto px-4 pt-4 pb-2 no-scrollbar">
        <div class="text-[12px] text-ink-2 bg-soon-bg text-soon-fg rounded-md p-2.5 leading-relaxed">{{ bootError }}</div>
      </div>
    </div>

    <router-view v-else />

    <div v-if="message" class="absolute left-1/2 bottom-[92px] -translate-x-1/2 w-full max-w-[480px] flex justify-center px-4 z-[60] pointer-events-none">
      <div class="bg-[rgba(20,30,25,0.9)] text-white text-[13px] px-4 py-2.5 rounded-full max-w-full text-center inline-flex items-center gap-3 pointer-events-auto">
        <span>{{ message }}</span>
        <button v-if="action" type="button" class="bg-transparent border-0 text-white text-[13px] font-medium cursor-pointer p-0 underline flex-none" @click="runAction">{{ action.text }}</button>
      </div>
    </div>
  </van-config-provider>
</template>
