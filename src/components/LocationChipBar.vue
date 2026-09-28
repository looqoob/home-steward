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
  <div class="pos-scroll">
    <button class="pos-chip" :class="{ on: props.modelValue === null }" @click="emit('update:modelValue', null)">
      全部 <span class="n">{{ total }}</span>
    </button>
    <button
      v-for="l in locations.enabled"
      :key="l.id"
      class="pos-chip"
      :class="{ on: props.modelValue === l.id }"
      @click="emit('update:modelValue', l.id)"
    >
      <span class="pos-dot" :class="ENV_MAP[l.env].dotClass"></span>{{ l.name }}
      <span class="n">{{ countOf(l.id) }}</span>
    </button>
    <button v-if="props.showManage !== false" class="pos-chip manage" @click="emit('manage')">管理</button>
  </div>
</template>
