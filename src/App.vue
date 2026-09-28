<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { db } from '@/data';
import { ensureSeed } from '@/data/seed';
import { useSettingsStore } from '@/stores/settings';
import { useDictStore } from '@/stores/dict';
import { useLocationsStore } from '@/stores/locations';
import { useItemsStore } from '@/stores/items';
import { useShoppingStore } from '@/stores/shopping';
import { useToast } from '@/composables/useToast';
import { useReminder } from '@/composables/useReminder';

const settings = useSettingsStore();
const dict = useDictStore();
const locations = useLocationsStore();
const items = useItemsStore();
const shopping = useShoppingStore();
const reminder = useReminder();
const { message } = useToast();

const ready = ref(false);
const storageError = ref(false);
const bootError = ref('');

onMounted(async () => {
  try {
    const ok = await db.probe();
    if (!ok) {
      storageError.value = true;
      ready.value = true;
      return;
    }
    await ensureSeed(db);
    await Promise.all([settings.load(), dict.load(), locations.load(), items.load(), shopping.load()]);
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
  <div v-if="!ready" class="screen" style="align-items: center; justify-content: center">
    <div style="color: var(--text-3); font-size: 13px">正在准备本地数据…</div>
  </div>

  <div v-else-if="storageError" class="screen">
    <div class="navbar"><h2>无法使用本地存储</h2></div>
    <div class="body">
      <div class="note is-warn">
        浏览器/系统禁用了本地数据库（IndexedDB），数据无法保存。请关闭无痕模式、允许站点数据后重试；
        若使用国产 WebView，建议改用 APK 版本。
      </div>
    </div>
  </div>

  <div v-else-if="bootError" class="screen">
    <div class="navbar"><h2>初始化失败</h2></div>
    <div class="body">
      <div class="note is-warn">{{ bootError }}</div>
    </div>
  </div>

  <router-view v-else />

  <div v-if="message" class="toast">{{ message }}</div>
</template>
