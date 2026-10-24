<script setup lang="ts">
/**
 * 新鲜度徽标（v1.1 F14 抽公用）：`rounded-full` 小徽标 + 六态语义色 + label 文字。
 *
 * 抽出的原因：同一视觉曾在 4 处各写一份（组卡两处 map / 待办三元 / 盘点面板四态映射），
 * F11-② 把过期徽标改成实底时改了两处、**盘点面板的手写副本静默漏改**——
 * 没有单一真源的状态色，每次视觉调整都会留下漏网副本。
 *
 * ⚠️ 状态色映射只住在这里：改徽标视觉（如 over 实底）**只改本组件**，
 * 页面里不要再出现 `bg-over-bg text-over-fg` 这类手写组合（audit-ui 会抓）。
 * label 始终伴随颜色渲染——红绿色盲不靠色相也能读出状态（F11-② 的兜底）。
 */
import type { FreshnessState } from '@/domain/freshness';

withDefaults(
  defineProps<{
    /** 六态之一；色值规则见组件内的 CLASS 映射 */
    state: FreshnessState;
    /** 徽标文字（`freshnessOf().label`，调用方可拼接日期前缀） */
    label: string;
    /** sm 用于展开行等紧凑场景（内边距小一档），默认 md */
    size?: 'sm' | 'md';
  }>(),
  { size: 'md' },
);

/** 字面量映射而非字符串拼接：Tailwind 需要能扫到完整类名 */
const CLASS: Record<FreshnessState, string> = {
  fresh: 'bg-fresh-bg text-fresh-fg',
  soon: 'bg-soon-bg text-soon-fg',
  urgent: 'bg-urgent-bg text-urgent-fg',
  // 过期实底白字（F11-②）：与其他浅底徽标拉开明度差
  over: 'bg-over-solid text-over-solid-fg',
  warn: 'bg-sunken text-ink-2',
  none: 'bg-sunken text-ink-2',
};
</script>

<template>
  <span
    class="rounded-full whitespace-nowrap flex-none"
    :class="[CLASS[state], size === 'sm' ? 'text-[12px] px-1.5 py-0.5' : 'text-[12px] px-2 py-0.5']"
  >{{ label }}</span>
</template>
