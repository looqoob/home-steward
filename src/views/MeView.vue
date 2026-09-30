<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { useItemsStore } from '@/stores/items';
import { useLocationsStore } from '@/stores/locations';
import { useSettingsStore } from '@/stores/settings';
import { monthStats, locationDistribution } from '@/domain/stats';
import { ENV_MAP } from '@/domain/types';

const router = useRouter();
const items = useItemsStore();
const locations = useLocationsStore();
const settings = useSettingsStore();

const ms = computed(() => monthStats(items.list, items.logs, Date.now()));
const dist = computed(() =>
  locationDistribution(items.list, locations.all, (env) => ENV_MAP[env].color),
);

/** 入口右侧的摘要，让用户不进页面也知道当前是什么主题 */
const themeHint = computed(() => {
  const m = settings.settings.themeMode;
  if (m === 'light') return '浅色';
  if (m === 'dark') return '深色';
  return '跟随系统';
});

const links = computed(() => [
  { label: '消耗明细', to: '/consume-log', hint: '' },
  { label: '位置管理', to: '/locations', hint: '' },
  { label: '保质期字典', to: '/dict', hint: '' },
  { label: '外观与主题', to: '/appearance', hint: themeHint.value },
  { label: '提醒设置', to: '/settings', hint: '' },
  { label: '数据备份', to: '/backup', hint: '' },
]);
</script>

<template>
  <div>
    <div class="flex items-baseline justify-between gap-2 mb-3">
      <h1 class="text-[20px] font-semibold leading-[1.2]">我的</h1>
    </div>

    <div class="grid grid-cols-3 gap-2 mb-3.5">
      <div class="bg-card border border-line rounded-md p-2.5 text-center">
        <div class="block text-[20px] font-semibold leading-[1.2]">{{ ms.inbound }}</div>
        <div class="block text-[12px] text-ink-3 mt-0.5">本月入库</div>
      </div>
      <!-- 统计卡是居中排版，这里不能再挂 text-left：同一个元素上 text-center / text-left 谁生效
           取决于工具类在 CSS 里的先后，会与其它两张卡不对齐 -->
      <button
        type="button"
        class="bg-card border border-line rounded-md p-2.5 text-center cursor-pointer w-full"
        aria-label="查看消耗明细"
        @click="router.push('/consume-log')"
      >
        <div class="block text-[20px] font-semibold leading-[1.2]">{{ ms.consumed }}</div>
        <div class="block text-[12px] text-ink-3 mt-0.5">已消耗</div>
      </button>
      <div
        class="bg-card border rounded-md p-2.5 text-center"
        :class="ms.wastedAmount > 0 ? 'border-danger' : 'border-line'"
      >
        <div class="block text-[20px] font-semibold leading-[1.2]" :class="ms.wastedAmount > 0 ? 'text-danger' : ''">¥{{ ms.wastedAmount.toFixed(0) }}</div>
        <div class="block text-[12px] text-ink-3 mt-0.5">扔掉金额</div>
      </div>
    </div>

    <div class="text-[12px] text-ink-3 mt-2 mb-2">位置分布</div>
    <div v-if="dist.length === 0" class="text-center py-6 px-6 text-[13px] text-ink-3">暂无在库物品</div>
    <div v-for="s in dist" :key="s.locationId" class="flex items-center gap-2.5 mb-2.5 text-[12px]">
      <span class="w-[60px] flex-none text-ink-2 truncate whitespace-nowrap overflow-hidden">{{ s.name }}</span>
      <span class="flex-1 h-2 bg-sunken rounded overflow-hidden">
        <i class="block h-full rounded" :style="{ width: (s.percent * 100).toFixed(0) + '%', background: s.color }"></i>
      </span>
      <span class="w-9 text-right text-ink-2 flex-none">{{ s.count }}</span>
    </div>

    <div class="text-[12px] text-ink-3 mt-2 mb-2">设置</div>
    <button
      v-for="l in links"
      :key="l.to"
      type="button"
      class="flex items-center justify-between bg-card border border-line rounded-md px-3.5 py-3.5 mb-2 text-[14px] cursor-pointer gap-3 w-full text-left"
      @click="router.push(l.to)"
    >
      <span>{{ l.label }}</span>
      <span class="text-[12px] text-ink-3 flex-none flex items-center gap-1">
        <span v-if="l.hint">{{ l.hint }}</span>
        <span aria-hidden="true">›</span>
      </span>
    </button>

    <div class="text-[12px] text-ink-2 bg-sunken rounded-md p-2.5 leading-relaxed mt-3">
      所有数据仅保存在本机（IndexedDB），无服务器、无账号。建议定期在「数据备份」导出 JSON 以防丢失。
    </div>
  </div>
</template>
