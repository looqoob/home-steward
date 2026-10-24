<script setup lang="ts">
/**
 * 列表分组段头（v1.1 F14 抽公用）：`标题 + 计数` 的小节标题。
 *
 * 抽出的原因：库存页与消耗明细的 sticky 段头是 F8 时逐字照抄的，之后各自微调，
 * 间距已漂移成 `mt-2.5 mb-2.5` vs `mt-3 mb-2`；清单 / 统计页的非吸顶段头
 * 是第三种写法（无出血、无吸顶）。同一视觉四种副本，这就是「没抽公用」的标准代价。
 *
 * 两档：
 * - `sticky`（默认）：吸列表容器顶（`top-[-1px]` 封缝 + `z-[19]` 压过卡片 +
 *   横向出血 `-mx-4 px-4`），用于**列表内部滚动**的页（F8/F9 体系）；
 * - `plain`：随内容流的普通小节标题（无吸顶 / 无出血），用于静态分组。
 *
 * ⚠️ 间距统一由本组件定（`mt-2.5 mb-2.5`），调用方**不要再挂 mt/mb 工具类**。
 */
withDefaults(
  defineProps<{
    /** 段标题 */
    label: string;
    /** 段内条数（按份 / 按笔，口径由调用方决定）；不传则不渲染计数 */
    count?: number | null;
    /** `sticky` 吸顶（默认）或 `plain` 普通流 */
    variant?: 'sticky' | 'plain';
  }>(),
  { count: null, variant: 'sticky' },
);
</script>

<template>
  <div
    :class="variant === 'sticky'
      ? 'sticky top-[-1px] z-[19] bg-page -mx-4 px-4 py-1.5 mt-2.5 mb-2.5 flex items-center gap-2 text-[13px] font-medium text-ink-1'
      : 'flex items-center gap-2 text-[13px] font-medium text-ink-1 mt-2.5 mb-2'"
  >
    <span>{{ label }}</span>
    <span v-if="count !== null && count !== undefined" class="text-[12px] text-ink-3 font-normal">{{ count }}</span>
    <slot />
  </div>
</template>
