<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { useItemsStore } from '@/stores/items';
import { useLocationsStore } from '@/stores/locations';
import { monthStats, locationDistribution } from '@/domain/stats';
import { ENV_MAP } from '@/domain/types';

const router = useRouter();
const items = useItemsStore();
const locations = useLocationsStore();

const ms = computed(() => monthStats(items.list, items.logs, Date.now()));
const dist = computed(() =>
  locationDistribution(items.list, locations.all, (env) => ENV_MAP[env].color),
);

const links = [
  { label: '位置管理', to: '/locations' },
  { label: '保质期字典', to: '/dict' },
  { label: '提醒设置', to: '/settings' },
  { label: '数据备份', to: '/backup' },
];
</script>

<template>
  <div>
    <div class="summary">
      <div class="metric">
        <div class="num">{{ ms.inbound }}</div>
        <div class="lab">本月入库</div>
      </div>
      <div class="metric">
        <div class="num">{{ ms.consumed }}</div>
        <div class="lab">已消耗</div>
      </div>
      <div class="metric" :class="{ 'is-warn': ms.wastedAmount > 0 }">
        <div class="num">¥{{ ms.wastedAmount.toFixed(0) }}</div>
        <div class="lab">扔掉金额</div>
      </div>
    </div>

    <div class="section-title"><span>位置分布</span></div>
    <div v-if="dist.length === 0" class="empty" style="padding: 24px">
      暂无在库物品
    </div>
    <div v-for="s in dist" :key="s.locationId" class="waste-bar">
      <span class="lab">{{ s.name }}</span>
      <span class="track"><i :style="{ width: (s.percent * 100).toFixed(0) + '%', background: s.color }"></i></span>
      <span class="pc">{{ s.count }}</span>
    </div>

    <div class="section-title"><span>设置</span></div>
    <div
      v-for="l in links"
      :key="l.to"
      class="set-row"
      @click="router.push(l.to)"
    >
      <span>{{ l.label }}</span>
      <span class="val">›</span>
    </div>

    <div class="note" style="margin-top: 12px">
      所有数据仅保存在本机（IndexedDB），无服务器、无账号。建议定期在「数据备份」导出 JSON 以防丢失。
    </div>
  </div>
</template>
