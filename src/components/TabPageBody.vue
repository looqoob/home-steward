<script setup lang="ts">
/**
 * Tab 页骨架（v1.1 F14 抽公用）：固化 F8/F9「固定头部 + 内容自治滚动」的容器结构。
 *
 * 抽出的原因：这套结构在库存 / 清单 / 我的 / 消耗明细四页各手写一遍，
 * F12 抓到的「pt-4 与 PageHeader topGap 叠加导致标题行低 16px」正是手写副本
 * 写错结构的直接产物——骨架若早固化，这类错误结构上不可能发生。
 *
 * 两种模式：
 * - `list`（默认）：`#header` slot 恒不滚动（`flex-none`，含水平出血 `-mx-4 px-4`
 *   供吸顶元素全宽），默认 slot 是内部滚动列表（`flex-1 min-h-0 overflow-y-auto`）；
 * - `page`：整页内容一起滚（统计页这类无固定头的），默认 slot 直接是内容。
 *
 * ⚠️ **Tab 页不要再手写 `h-full flex flex-col` 骨架**（audit-ui 会抓）：
 * 顶部留白一律由 PageHeader 的 topGap 承担，本组件的根容器**不设任何上内边距**。
 * 底部让位（FAB / 吸底条）通过 `scroll-class` 传 `pb-[var(--fab-space)]` 等 token。
 */
withDefaults(
  defineProps<{
    mode?: 'list' | 'page';
    /** 附加到滚动容器的类：底部让位（pb-*）等由页面按场景传入 */
    scrollClass?: string;
    /** 附加到头部容器的类（仅 list 模式） */
    headerClass?: string;
  }>(),
  { mode: 'list', scrollClass: '', headerClass: '' },
);

/**
 * 转发滚动容器的原生 scroll 事件（含 .passive）。
 * 窗口化渲染（useWindowedList）靠它判断触底，事件 target 即滚动容器本身，
 * 页面不需要再拿容器 ref。
 */
const emit = defineEmits<{ (e: 'scroll', ev: Event): void }>();
</script>

<template>
  <!-- page 模式：根容器即滚动容器，没有固定头 -->
  <div
    v-if="mode === 'page'"
    class="h-full overflow-y-auto no-scrollbar overscroll-contain"
    :class="scrollClass"
    @scroll.passive="emit('scroll', $event)"
  >
    <slot />
  </div>

  <!-- list 模式：固定头部 + 内部滚动列表 -->
  <div v-else class="h-full flex flex-col">
    <div class="flex-none -mx-4 px-4 pb-2.5" :class="headerClass">
      <slot name="header" />
    </div>
    <div
      class="flex-1 min-h-0 overflow-y-auto no-scrollbar overscroll-contain -mx-4 px-4"
      :class="scrollClass"
      @scroll.passive="emit('scroll', $event)"
    >
      <slot />
    </div>
  </div>
</template>
