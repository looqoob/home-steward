<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import NavBar from '@/components/NavBar.vue';
import { useSettingsStore } from '@/stores/settings';

const router = useRouter();
const settings = useSettingsStore();

const timeStr = computed({
  get: () => `${String(settings.settings.remindHour).padStart(2, '0')}:${String(settings.settings.remindMinute).padStart(2, '0')}`,
  set: (v: string) => {
    const [h, m] = v.split(':').map(Number);
    if (!Number.isNaN(h) && !Number.isNaN(m)) settings.patch({ remindHour: h, remindMinute: m });
  },
});

const soonDays = computed({
  get: () => String(settings.settings.soonDays),
  set: (v: string) => {
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) settings.patch({ soonDays: Math.round(n) });
  },
});

const urgentDays = computed({
  get: () => String(settings.settings.urgentDays),
  set: (v: string) => {
    const n = Number(v);
    if (Number.isFinite(n) && n >= 0) settings.patch({ urgentDays: Math.round(n) });
  },
});

async function toggleRemind() {
  await settings.patch({ remindEnabled: !settings.settings.remindEnabled });
}
</script>

<template>
  <div class="flex flex-col bg-page h-full w-full max-w-[480px] mx-auto relative overflow-hidden">
    <NavBar title="提醒设置" show-back @back="router.back()" />

    <div class="flex-1 overflow-y-auto px-4 pt-4 pb-2 no-scrollbar overscroll-contain">
      <div class="flex items-center justify-between bg-card border border-line rounded-md px-3.5 py-3.5 mb-2 text-[14px] cursor-default gap-3">
        <span>开启临期提醒</span>
        <van-switch :model-value="settings.settings.remindEnabled" @change="toggleRemind" />
      </div>

      <div class="mb-3.5 mt-1.5">
        <label class="block text-[12px] text-ink-2 mb-1.5" for="remind-time">每日提醒时间（原生 App 会在此时推送；网页版需当天打开过一次）</label>
        <input
          id="remind-time"
          v-model="timeStr"
          type="time"
          class="w-full h-11 border border-line-strong rounded-md px-3 text-[14px] bg-card text-ink-1 focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-50"
        />
      </div>

      <div class="mb-3.5">
        <label class="block text-[12px] text-ink-2 mb-1.5" for="soon-days">临期阈值（剩余 ≤ N 天）</label>
        <input
          id="soon-days"
          v-model="soonDays"
          type="number"
          min="1"
          class="w-full h-11 border border-line-strong rounded-md px-3 text-[14px] bg-card text-ink-1 focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-50"
        />
      </div>

      <div class="mb-3.5">
        <label class="block text-[12px] text-ink-2 mb-1.5" for="urgent-days">紧急 / 待吃阈值（剩余 ≤ N 天）</label>
        <input
          id="urgent-days"
          v-model="urgentDays"
          type="number"
          min="0"
          class="w-full h-11 border border-line-strong rounded-md px-3 text-[14px] bg-card text-ink-1 focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-50"
        />
      </div>

      <div class="text-[12px] text-ink-2 bg-sunken rounded-md p-2.5 leading-relaxed">
        网页（PWA）版本没有可靠的后台定时，会在你每次打开 App 时检查并发通知；安装到手机桌面或改用 APK 可获得更稳定的本地定时提醒。
      </div>
    </div>
  </div>
</template>
