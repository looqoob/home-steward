<script setup lang="ts">
import { computed } from 'vue';
import { useLocationsStore } from '@/stores/locations';
import { useItemsStore } from '@/stores/items';
import { ENV_MAP } from '@/domain/types';

const props = defineProps<{ modelValue: string | null; showManage?: boolean }>();
const emit = defineEmits<{ (e: 'update:modelValue', v: string | null): void; (e: 'manage'): void }>();

const locations = useLocationsStore();
const items = useItemsStore();

const total = computed(() => items.active.length);

function countOf(id: string) {
  return items.active.filter((i) => i.locationId === id).length;
}
</script>

<template>
  <div class="flex gap-1.5 overflow-x-auto pb-1 mb-3 no-scrollbar">
    <!-- 选中/未选中的配色写成互斥三元组，而不是「静态类 + 条件类叠加」：后者依赖工具类在
         CSS 里的先后顺序才能覆盖，一旦顺序变了选中态就会失效（文字仍是黑色）。 -->
    <button
      type="button"
      class="inline-flex items-center gap-1.5 whitespace-nowrap text-[13px] border rounded-full px-3 py-1.5 cursor-pointer min-h-10"
      :class="props.modelValue === null
        ? 'bg-primary-600 border-primary-600 text-white font-medium'
        : 'bg-card border-line text-ink-2 hover:border-line-strong'"
      @click="emit('update:modelValue', null)"
    >
      全部 <span class="text-[12px] opacity-70">{{ total }}</span>
    </button>
    <button
      v-for="l in locations.enabled"
      :key="l.id"
      type="button"
      class="inline-flex items-center gap-1.5 whitespace-nowrap text-[13px] border rounded-full px-3 py-1.5 cursor-pointer min-h-10"
      :class="props.modelValue === l.id
        ? 'bg-primary-600 border-primary-600 text-white font-medium'
        : 'bg-card border-line text-ink-2 hover:border-line-strong'"
      @click="emit('update:modelValue', l.id)"
    >
      <span class="w-1.5 h-1.5 rounded-full block flex-none" :style="{ background: ENV_MAP[l.env].color }"></span>{{ l.name }}
      <span class="text-[12px] opacity-70">{{ countOf(l.id) }}</span>
    </button>
    <button
      v-if="props.showManage !== false"
      type="button"
      class="inline-flex items-center gap-1.5 whitespace-nowrap text-[13px] text-ink-3 bg-transparent border border-dashed border-line rounded-full px-3 py-1.5 cursor-pointer min-h-10"
      @click="emit('manage')"
    >管理</button>
  </div>
</template>
