<script setup lang="ts">
import { computed } from 'vue';

/**
 * 统计数字卡：大号数字 + 小字标签。
 *
 * 此前 4 组共 13 张卡各写一份，且已漂出两处不一致：
 *   - 字号：统计页 4 列卡用 `18px / 11px`，其余页面用 `20px / 12px`
 *   - 容器：库存页的筛选卡是 `border rounded-md`（无阴影），其余用 `.card`
 * 统计数字是同一层级的视觉元素，跨页换字号会让用户在页面之间反复重新标定「这个数有多大」。
 * 现在一律 20 / 12，窄到 4 列也放得下（480px 宽下每张约 106px）。
 *
 * 两种形态：
 *   - 只读卡（默认渲染 `<div>`）
 *   - 可点击卡（`clickable`，渲染 `<button>`，用于「点一下按这个状态筛选」）
 *     点击与 aria-label 由调用点直接挂在组件上（属性透传到根元素）。
 */
type Tone = 'neutral' | 'urgent' | 'over' | 'danger';

const props = withDefaults(
  defineProps<{
    value: string | number;
    label: string;
    /**
     * 语义色：urgent / over 用状态底色（库存页筛选卡），danger 只染描边与数字（浪费金额）。
     * 底色与文字色成对出现，避免出现「有底色但文字对比度不足」的组合。
     */
    tone?: Tone;
    /** 选中态描边（仅可点击的筛选卡） */
    selected?: boolean;
    /** 渲染为按钮，用于状态筛选 */
    clickable?: boolean;
  }>(),
  { tone: 'neutral', selected: false, clickable: false },
);

/** 字面量映射而非字符串拼接：Tailwind 需要能扫到完整类名 */
const BOX_CLASS: Record<Tone, string> = {
  neutral: 'border-line text-ink-1',
  urgent: 'bg-urgent-bg border-urgent-bg text-urgent-fg',
  over: 'bg-over-bg border-over-bg text-over-fg',
  danger: 'border-danger text-ink-1',
};
const NUM_CLASS: Record<Tone, string> = {
  neutral: '',
  urgent: '',
  over: '',
  danger: 'text-danger',
};
const LABEL_CLASS: Record<Tone, string> = {
  neutral: 'text-ink-3',
  urgent: 'text-urgent-fg',
  over: 'text-over-fg',
  danger: 'text-ink-3',
};

const boxClass = computed(() => BOX_CLASS[props.tone]);
const numClass = computed(() => NUM_CLASS[props.tone]);
const labelClass = computed(() => LABEL_CLASS[props.tone]);
</script>

<template>
  <component
    :is="clickable ? 'button' : 'div'"
    :type="clickable ? 'button' : undefined"
    class="card p-2.5 text-center w-full"
    :class="[
      boxClass,
      clickable ? 'cursor-pointer transition' : '',
      selected ? 'ring-2 ring-primary-600' : '',
    ]"
  >
    <span class="block text-[20px] font-semibold leading-[1.2]" :class="numClass">{{ value }}</span>
    <span class="block text-[12px] mt-0.5" :class="labelClass">{{ label }}</span>
  </component>
</template>
