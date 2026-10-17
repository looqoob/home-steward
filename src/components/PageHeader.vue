<script setup lang="ts">
/**
 * Tab 页的页内标题行：`页面名 + 右侧操作/计数`。
 *
 * Tab 页的**顶栏**由 TabLayout 按 `route.meta.header` 渲染，不在页面里；
 * 这一行是顶栏下方的内容标题。此前三个页面各写一份，并已漂成两种：
 *   - 库存页：`items-center min-h-9 mb-3.5`（右侧是 32px 图标按钮）
 *   - 清单 / 我的：`items-baseline mb-3`（右侧是 12px 文字）
 * 基线对齐遇到按钮会让按钮上下错位，所以统一为 `items-center` + `min-h-9`（内容区恒 36px 高，
 * 右侧放按钮或文字都不跳），下外边距统一 14px。
 *
 * `topGap` 负责「顶部 16px 留白」：TabLayout 给主 Tab 页的滚动容器取消上内边距
 * （见 styles/README.md「吸顶层约定」），留白改由这个普通流占位元素承担；
 * 它必须在滚动容器**内部**，否则 sticky 条与顶栏之间会漏缝。
 */
withDefaults(
  defineProps<{
    title: string;
    /** 顶部 16px 占位；页面自己已经有占位元素时关掉 */
    topGap?: boolean;
  }>(),
  { topGap: true },
);
</script>

<template>
  <div>
    <div v-if="topGap" class="h-4" aria-hidden="true"></div>

    <header class="flex items-center justify-between gap-2 min-h-9 mb-3.5">
      <h1 class="text-[20px] font-semibold leading-[1.2]">{{ title }}</h1>
      <div class="flex items-center gap-1 flex-none">
        <slot name="actions" />
      </div>
    </header>
  </div>
</template>
