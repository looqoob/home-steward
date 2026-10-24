<script setup lang="ts">
import { computed } from 'vue';
import { useLocationsStore } from '@/stores/locations';
import { useItemsStore } from '@/stores/items';
import { ENV_MAP } from '@/domain/types';
import { countsByLocation } from '@/domain/locationRules';
import Pill from '@/components/Pill.vue';
import PillGroup from '@/components/PillGroup.vue';

const props = defineProps<{ modelValue: string | null; showManage?: boolean }>();
const emit = defineEmits<{ (e: 'update:modelValue', v: string | null): void; (e: 'manage'): void }>();

const locations = useLocationsStore();
const items = useItemsStore();

const total = computed(() => items.active.length);

// 一次扫描聚合出所有位置的计数（REV-35）：此前模板里每个 Pill 各扫一遍 items
const counts = computed(() => countsByLocation(items.active));

function countOf(id: string) {
  return counts.value.get(id) ?? 0;
}
</script>

<template>
  <PillGroup scroll class="mb-3">
    <Pill
      :selected="props.modelValue === null"
      @click="emit('update:modelValue', null)"
    >
      全部 <span class="text-[12px] opacity-70">{{ total }}</span>
    </Pill>

    <Pill
      v-for="l in locations.enabled"
      :key="l.id"
      :selected="props.modelValue === l.id"
      :dot-color="ENV_MAP[l.env].color"
      @click="emit('update:modelValue', l.id)"
    >
      {{ l.name }}
      <span class="text-[12px] opacity-70">{{ countOf(l.id) }}</span>
    </Pill>

    <!-- 「管理」不是筛选项，而是动作，所以不复用 Pill（避免出现 aria-pressed） -->
    <button
      v-if="props.showManage !== false"
      type="button"
      class="inline-flex items-center gap-1.5 whitespace-nowrap text-[13px] text-ink-3 bg-transparent border border-dashed border-line rounded-full px-3 py-1.5 cursor-pointer min-h-10"
      @click="emit('manage')"
    >管理</button>
  </PillGroup>
</template>
