<script setup lang="ts">
/**
 * 图标选择器（v1.1 F5）：一行可横滚的 emoji 胶囊 + 「默认」档。
 *
 * `modelValue` 语义与 `Item.icon` 一致：`null` = 默认（用名字首字），
 * emoji 字符串 = 用户选择。「你的常用」由调用方从既有物品的 icon 统计传入
 * （不落库、不新增设置字段，数据本来就在）。
 */
import { computed } from 'vue';
import Pill from '@/components/Pill.vue';
import PillGroup from '@/components/PillGroup.vue';

const props = withDefaults(
  defineProps<{
    modelValue: string | null;
    /** 用户用过的高频 emoji（调用方从 items 统计），排在内置集前面 */
    recent?: string[];
  }>(),
  { recent: () => [] },
);
const emit = defineEmits<{ (e: 'update:modelValue', v: string | null): void }>();

/** 内置常用食材 / 家务 emoji（顺序即推荐度，动它前先在浏览器里过一眼渲染） */
const PRESET = [
  '🥬', '🥕', '🥒', '🍅', '🥦', '🍆', '🥔', '🧄', '🧅', '🍄',
  '🍎', '🍌', '🍊', '🍇', '🍓', '🥛', '🥚', '🍗', '🥩', '🐟',
  '🦐', '🍚', '🍜', '🧊', '🧴', '🧻',
];

const options = computed(() => [...new Set([...props.recent, ...PRESET])]);
</script>

<template>
  <PillGroup scroll role="group" aria-label="选择图标">
    <Pill :selected="modelValue === null" @click="emit('update:modelValue', null)">默认</Pill>
    <Pill
      v-for="e in options"
      :key="e"
      :selected="modelValue === e"
      :aria-label="`图标 ${e}`"
      @click="emit('update:modelValue', e)"
    >{{ e }}</Pill>
  </PillGroup>
</template>
