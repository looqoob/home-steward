<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { db } from '@/data';
import { onDataChanged } from '@/data/sync';
import { ensureSeed } from '@/data/seed';
import { hashId } from '@/domain/ids';
import { useSettingsStore } from '@/stores/settings';
import { useDictStore } from '@/stores/dict';
import { useLocationsStore } from '@/stores/locations';
import { useItemsStore } from '@/stores/items';
import { useShoppingStore } from '@/stores/shopping';
import { useBarcodesStore } from '@/stores/barcodes';
import { useSnapshotsStore } from '@/stores/snapshots';
import { useToast } from '@/composables/useToast';
import { useReminder } from '@/composables/useReminder';
import { useTheme } from '@/composables/useTheme';

const settings = useSettingsStore();
const dict = useDictStore();
const locations = useLocationsStore();
const items = useItemsStore();
const shopping = useShoppingStore();
const barcodes = useBarcodesStore();
const snapshots = useSnapshotsStore();
const reminder = useReminder();
const { message, action, runAction, show } = useToast();
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

/**
 * 提醒设置一变就重排程（REV-11）。此前 `refresh()` 只在启动时调一次：
 * 改提醒时间不重启不生效；**关掉提醒也不会取消已排程的通知**，第二天照弹。
 * 放在 App 层 watch 而不是 settings store 里调，避免 store ↔ composable 循环依赖。
 */
watch(
  () => [settings.settings.remindEnabled, settings.settings.remindHour, settings.settings.remindMinute] as const,
  () => {
    if (ready.value) void reminder.refresh();
  },
);

const router = useRouter();

/**
 * 通知点击直达物品（v1.1 F3，仅原生壳）。
 *
 * 排程时通知 id 就是 `hashId(item.id)`（见 useReminder），点击时反查物品跳详情；
 * 查不到（已消耗 / 已删 / 数据变了）就落到库存页。
 *
 * ⚠️ 冷启动竞态：Capacitor 会把「点通知拉起 App」的 actionPerformed 缓冲到首个
 * addListener 才派发，而此时 stores 还没加载完（items.list 为空，必查不到）——
 * 先挂起 pendingNavId，等 boot 完成后再导航。PWA 侧的 notificationclick 需要
 * injectManifest 自定义 SW（当前是 generateSW），暂不做，保持默认聚焦行为。
 */
let pendingNavId: number | null = null;

function navigateByNotification(id: number) {
  const hit = items.list.find((i) => hashId(i.id) === id);
  void router.push(hit ? `/item/${hit.id}` : '/stock');
}

function initNotificationNavigation() {
  if (!Capacitor.isNativePlatform()) return;
  void LocalNotifications.addListener('localNotificationActionPerformed', (event) => {
    const id = event.notification.id;
    if (typeof id !== 'number') return;
    if (ready.value) navigateByNotification(id);
    else pendingNavId = id;
  }).catch(() => {
    /* 插件不可用时静默：通知点击退化为普通打开 */
  });
}

onMounted(async () => {
  // 越早注册越好：热点击随时可能发生，冷启动事件也在等首个 listener
  initNotificationNavigation();
  try {
    const ok = await db.probe();
    if (!ok) {
      storageError.value = true;
      ready.value = true;
      return;
    }
    await ensureSeed(db);
    // 申请持久存储（批次 5，REV-34 的结构性补丁）：Chrome 在存储紧张时会清理 IndexedDB，
    // 纯本地无备份是本产品最大的数据风险。是否批准由浏览器按站点参与度决定，静默请求即可；
    // 被拒绝也不影响功能。状态展示（「已保护/可能被清理」）待后续版本接入 UI。
    try {
      await navigator.storage?.persist?.();
    } catch {
      /* 老 WebView 不支持：忽略 */
    }
    await Promise.all([
      settings.load(),
      dict.load(),
      locations.load(),
      items.load(),
      shopping.load(),
      // 条码映射：扫码时要立刻能查到历史映射，不能等到进管理页才加载
      barcodes.load(),
      // 月末快照：统计页的「本月 vs 上月」要立刻可用
      snapshots.load(),
    ]);
    ready.value = true;
    // 次月首启补写上月末快照（v1.1 F4）：放在 stores 就绪之后、清单生成之前，
    // 快照要的是「本月还没被建议/提醒动过的在库状态」
    await snapshots.ensureMonthly(items.list);
    await shopping.generate();
    await reminder.refresh();

    // 冷启动时通知点击先于数据到达（见 initNotificationNavigation）：此刻再补导航
    if (pendingNavId !== null) {
      const id = pendingNavId;
      pendingNavId = null;
      navigateByNotification(id);
    }

    // 多标签同步（REV-15）：其它窗口写库后本窗口自动重读全部 store。
    // 不做的话，本窗口继续用旧快照整条 put，会把另一个窗口的写入无声覆盖掉。
    // 防抖 300ms：一次批量写会触发一串 broadcast，只需重读一次。
    let syncTimer: ReturnType<typeof setTimeout> | null = null;
    onDataChanged(() => {
      if (!ready.value) return;
      if (syncTimer) clearTimeout(syncTimer);
      syncTimer = setTimeout(async () => {
        await Promise.all([settings.load(), dict.load(), locations.load(), items.load(), shopping.load(), barcodes.load(), snapshots.load()]);
        show('已同步其它窗口的改动', 1800);
      }, 300);
    });
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
