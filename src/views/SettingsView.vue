<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import NavBar from '@/components/NavBar.vue';
import { useSettingsStore } from '@/stores/settings';

const router = useRouter();
const settings = useSettingsStore();

/**
 * 库存列表展示方式（三选一，见 `StockViewMode`）。
 *
 * 为什么是**一个设置项三个取值**而不是「分组开关 + 时间轴开关」：
 * 两者是同一份列表的两种切法，互斥。做成两个开关会出现「都开 / 都关」两种无意义状态，
 * 而 `flat`（不分段）正好就是「都不启用」那一档，用一个枚举表达才不会自相矛盾。
 */
const STOCK_VIEW_OPTIONS = [
  { value: 'group', label: '按新鲜度', hint: '分成 紧急待吃 / 临期 / 新鲜 / 未设保质期 四段' },
  { value: 'timeline', label: '按到期日', hint: '分成 已过期 / 今天 / 明天 / 2–7 天 / 更晚 等桶' },
  { value: 'flat', label: '不分组', hint: '平铺一张长列表，仍按「最快过期的在前」排序' },
] as const;

const stockViewMode = computed({
  get: () => settings.settings.stockViewMode,
  set: (v: (typeof STOCK_VIEW_OPTIONS)[number]['value']) => {
    void settings.patch({ stockViewMode: v });
  },
});

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
    <NavBar title="设置" show-back @back="router.back()" />

    <div class="flex-1 overflow-y-auto px-4 pt-4 pb-2 no-scrollbar overscroll-contain">
      <!--
        分区标题用 ink-3 小字，与「我的」页 links 区的分组标题同一套视觉。
        库存相关设置统一收在这里，将来新增（如默认展开折叠组、是否显示进度条）往这一节加。
      -->
      <div class="section-label">库存设置</div>

      <div class="card px-3.5 py-3 mb-2">
        <div class="text-[14px] mb-1">列表展示方式</div>
        <div class="text-[12px] text-ink-3 mb-2.5">决定库存列表是按新鲜度分组、按到期日排列，还是完全不分组。</div>
        <div class="flex gap-1" role="group" aria-label="库存列表展示方式">
          <button
            v-for="o in STOCK_VIEW_OPTIONS"
            :key="o.value"
            type="button"
            class="flex-1 text-[13px] border rounded-full px-2 py-1 min-h-10 cursor-pointer"
            :class="stockViewMode === o.value
              ? 'bg-primary-600 border-primary-600 text-white font-medium'
              : 'bg-card border-line text-ink-2'"
            :aria-pressed="stockViewMode === o.value"
            @click="stockViewMode = o.value"
          >{{ o.label }}</button>
        </div>
        <div class="text-[12px] text-ink-2 mt-2.5 leading-relaxed">
          {{ STOCK_VIEW_OPTIONS.find((o) => o.value === stockViewMode)?.hint }}
        </div>
      </div>

      <div class="section-label">提醒设置</div>

      <div class="flex items-center justify-between card px-3.5 py-3.5 mb-2 text-[14px] cursor-default gap-3">
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

      <div class="tip">
        网页（PWA）版本没有可靠的后台定时，会在你每次打开 App 时检查并发通知；安装到手机桌面或改用 APK 可获得更稳定的本地定时提醒。
      </div>
    </div>
  </div>
</template>
