<script setup lang="ts">
import { computed } from 'vue';
import type { Item, Location } from '@/domain/types';
import { ENV_MAP } from '@/domain/types';
import { badgeClass, barColor, freshnessOf } from '@/domain/freshness';
import { useSettingsStore } from '@/stores/settings';
import { todayStr } from '@/domain/dates';

const props = defineProps<{ item: Item; location?: Location }>();
const emit = defineEmits<{ (e: 'click', item: Item): void }>();

const settings = useSettingsStore();
const today = todayStr();

const f = computed(() => freshnessOf(props.item, today, settings.settings));
const env = computed(() => (props.location ? ENV_MAP[props.location.env] : null));
const qty = computed(() => {
  const q = props.item.quantity;
  const s = Number.isInteger(q) ? String(q) : String(Math.round(q * 100) / 100);
  return `${s} ${props.item.unit}`.trim();
});
</script>

<template>
  <div class="card" @click="emit('click', props.item)">
    <div class="thumb">{{ props.item.icon || props.item.name.slice(0, 1) }}</div>
    <div class="main">
      <div class="row1">
        <span class="name">{{ props.item.name }}</span>
        <span class="badge" :class="badgeClass(f.state)">{{ f.label }}</span>
      </div>
      <div class="sub">
        <span>{{ qty }}</span>
        <span v-if="props.location" class="loc-tag">
          <i :style="{ background: env?.color }"></i>{{ props.location.name }}
        </span>
        <span v-if="props.item.notRecommended" class="loc-tag">不建议存放</span>
      </div>
      <div v-if="f.progress !== null" class="bar">
        <i :style="{ width: (f.progress * 100).toFixed(0) + '%', background: barColor(f.state) }"></i>
      </div>
    </div>
  </div>
</template>
