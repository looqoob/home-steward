<script setup lang="ts">
/**
 * 胶囊筛选按钮（单选 / 多选皆可）。
 *
 * 抽出来的原因：全站 18 处各写一份，基础类几乎逐字相同，但已经漂出四组不一致：
 *   - 内边距：`px-3 py-1.5`（多数）/ `px-3 py-1`（ListView）/ `px-2 py-1`（SettingsView）
 *   - 未选中 hover 描边：有的有 `hover:border-line-strong`，有的没有
 *   - 无障碍：只有 3 处写了 `aria-pressed`
 *   - 位置胶囊左侧的环境色点 span 重复了 4 份
 *
 * 选中态必须写成**互斥的两个分支**，不能「静态类 + 条件类叠加」——
 * 后者依赖工具类在 CSS 里的先后顺序，顺序一变选中态就失效（文字仍是黑色）。
 */
withDefaults(
  defineProps<{
    selected?: boolean;
    /** 左侧色点颜色（位置的 ENV_MAP[...].color 之类）；空串不渲染 */
    dotColor?: string;
    /** sm 用于工具栏内紧凑排列，md 用于表单里的选项组 */
    size?: 'sm' | 'md';
    /** 未选中时是否加 hover 描边；纯展示型胶囊可关掉避免误以为可点 */
    hoverable?: boolean;
  }>(),
  { selected: false, dotColor: '', size: 'md', hoverable: true },
);
</script>

<template>
  <button
    type="button"
    class="inline-flex items-center justify-center gap-1.5 whitespace-nowrap text-[13px] border rounded-full cursor-pointer min-h-10"
    :class="[
      size === 'sm' ? 'px-3 py-1' : 'px-3 py-1.5',
      selected
        ? 'bg-primary-600 border-primary-600 text-white font-medium'
        : ['bg-card border-line text-ink-2', hoverable ? 'hover:border-line-strong' : ''],
    ]"
    :aria-pressed="selected"
  >
    <span
      v-if="dotColor"
      class="w-1.5 h-1.5 rounded-full block flex-none"
      :style="{ background: dotColor }"
    ></span>
    <slot />
  </button>
</template>
