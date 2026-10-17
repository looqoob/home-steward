<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import PageHeader from '@/components/PageHeader.vue';
import StatCard from '@/components/StatCard.vue';
import { useItemsStore } from '@/stores/items';
import { useLocationsStore } from '@/stores/locations';
import { useSettingsStore } from '@/stores/settings';
import { useBarcodesStore } from '@/stores/barcodes';
import { monthStats, locationDistribution } from '@/domain/stats';
import { backupAdvice } from '@/domain/backup';
import { ENV_MAP } from '@/domain/types';

const router = useRouter();
const items = useItemsStore();
const locations = useLocationsStore();
const settings = useSettingsStore();
const barcodes = useBarcodesStore();

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
  { label: '统计', to: '/stats', hint: '' },
  { label: '消耗明细', to: '/consume-log', hint: '' },
  { label: '位置管理', to: '/locations', hint: '' },
  { label: '保质期字典', to: '/dict', hint: '' },
  {
    label: '条码映射',
    to: '/barcodes',
    // 有映射时给个数量，没扫过时就是 0
    hint: barcodes.list.length > 0 ? `${barcodes.list.length} 条` : '',
  },
  { label: '外观与主题', to: '/appearance', hint: themeHint.value },
  // 页面标题已改为「设置」：它现在同时承载「库存设置」与「提醒设置」两个分区
  { label: '设置', to: '/settings', hint: '' },
  { label: '数据备份', to: '/backup', hint: '' },
]);
/**
 * 未备份提醒（`domain/backup.backupAdvice`）。
 *
 * 只在超过门槛时出现，`level: 'none'` 时整条不渲染。
 * `warn`（90 天以上）用警示色描边——数据只在本机，丢了不可恢复，值得给个视觉升级。
 */
const backupTip = computed(() =>
  backupAdvice(settings.settings.lastBackupAt, settings.settings.createdAt),
);
</script>

<template>
  <div>
    <!-- 顶部 16px 占位由 PageHeader 提供；与库存 / 清单同一套页头节奏 -->
    <PageHeader title="我的" />

    <button
      v-if="backupTip.level !== 'none'"
      type="button"
      class="flex items-center justify-between gap-2 w-full text-left card px-3 py-2.5 mb-3.5 cursor-pointer"
      :class="backupTip.level === 'warn' ? 'border-danger' : 'border-line'"
      @click="router.push('/backup')"
    >
      <span class="flex items-center gap-2 min-w-0">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="icon icon-sm flex-none" :class="backupTip.level === 'warn' ? 'text-danger' : 'text-ink-3'">
          <path d="M12 9v4" />
          <path d="M12 17h.01" />
          <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
        </svg>
        <span class="text-[13px] text-ink-1 truncate">{{ backupTip.text }}</span>
      </span>
      <span class="text-[13px] text-primary-700 flex-none">立即导出</span>
    </button>

    <div class="grid grid-cols-3 gap-2 mb-3.5">
      <StatCard :value="ms.inbound" label="本月入库" />
      <!-- 统计卡是居中排版，点击态不能再挂 text-left：与另两张卡共用 StatCard 的居中规则 -->
      <StatCard
        :value="ms.consumed"
        label="已消耗"
        clickable
        aria-label="查看消耗明细"
        @click="router.push('/consume-log')"
      />
      <StatCard
        :value="`¥${ms.wastedAmount.toFixed(0)}`"
        label="扔掉金额"
        :tone="ms.wastedAmount > 0 ? 'danger' : 'neutral'"
      />
    </div>

    <div class="section-label">位置分布</div>
    <div v-if="dist.length === 0" class="text-center py-6 px-6 text-[13px] text-ink-3">暂无在库物品</div>
    <div v-for="s in dist" :key="s.locationId" class="flex items-center gap-2.5 mb-2.5 text-[12px]">
      <span class="w-[60px] flex-none text-ink-2 truncate whitespace-nowrap overflow-hidden">{{ s.name }}</span>
      <span class="flex-1 h-2 bg-sunken rounded overflow-hidden">
        <i class="block h-full rounded" :style="{ width: (s.percent * 100).toFixed(0) + '%', background: s.color }"></i>
      </span>
      <span class="w-9 text-right text-ink-2 flex-none">{{ s.count }}</span>
    </div>

    <div class="section-label">设置</div>
    <button
      v-for="l in links"
      :key="l.to"
      type="button"
      class="flex items-center justify-between card px-3.5 py-3.5 mb-2 text-[14px] cursor-pointer gap-3 w-full text-left"
      @click="router.push(l.to)"
    >
      <span>{{ l.label }}</span>
      <span class="text-[12px] text-ink-3 flex-none flex items-center gap-1">
        <span v-if="l.hint">{{ l.hint }}</span>
        <span aria-hidden="true">›</span>
      </span>
    </button>

    <div class="tip mt-3">
      所有数据仅保存在本机（IndexedDB），无服务器、无账号。建议定期在「数据备份」导出 JSON 以防丢失。
    </div>
  </div>
</template>
