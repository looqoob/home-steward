<script setup lang="ts">
/**
 * 胶囊按钮的容器：只负责布局（换行 / 横向滚动 / 间距），不做任何选项状态管理。
 *
 * 选项的 v-for 与选中判断留在调用点 —— 那里掌握的是业务数据（单位列表、
 * 位置列表、时间区间…），容器不该知道。这样既统一了间距与滚动行为，
 * 又不用为每种数据结构各写一份 Props。
 */
import { computed } from 'vue';

const props = withDefaults(
  defineProps<{
    /** 间距：xs=4px（等分按钮之间）/ sm=6px（默认）/ md=8px（按钮较大时） */
    gap?: 'xs' | 'sm' | 'md';
    /** 单行横向滚动（底部筛选条），默认换行 */
    scroll?: boolean;
  }>(),
  { gap: 'sm', scroll: false },
);

const GAP_CLASS: Record<'xs' | 'sm' | 'md', string> = {
  xs: 'gap-1',
  sm: 'gap-1.5',
  md: 'gap-2',
};
const gapClass = computed(() => GAP_CLASS[props.gap]);
</script>

<template>
  <div
    class="flex"
    :class="[scroll ? 'overflow-x-auto pb-1 no-scrollbar' : 'flex-wrap', gapClass]"
  >
    <slot />
  </div>
</template>
