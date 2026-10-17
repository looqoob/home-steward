<script setup lang="ts">
/**
 * 二级页外壳：导航栏 + 可滚动内容区。
 *
 * 此前 7 个页面（设置 / 外观 / 备份 / 字典 / 位置 / 物资编辑 / 条码映射）把
 * 外层 `flex flex-col bg-page h-full w-full max-w-[480px] mx-auto relative overflow-hidden`
 * 与滚动区 `flex-1 overflow-y-auto px-4 pt-4 pb-2 no-scrollbar overscroll-contain`
 * 逐字抄了 7 遍，且每个页面都为了 `router.back()` 引入一次 `useRouter`。
 * 这里把外壳、滚动语义和返回动作一次定义好，页面只剩内容。
 *
 * 与 TabLayout 的区别：Tab 页的顶栏由**外壳**渲染在滚动容器外面（避免随内容滚走、
 * 被 px-4 缩进），而二级页整页独立，NavBar 就在页面自己的 flex 列里。
 */
import { useRouter } from 'vue-router';
import NavBar from '@/components/NavBar.vue';

withDefaults(
  defineProps<{
    title: string;
    /** 是否显示返回箭头；二级页默认显示 */
    back?: boolean;
    /**
     * 滚动区内边距：
     * - normal（默认）`px-4 pt-4 pb-2`，常规内容页
     * - flush-top `pt-0`，页面自带上留白占位或吸顶条时用（padding 会把 sticky 推离容器顶边）
     * - flush 上下都 0，页内自己接管留白
     */
    padding?: 'normal' | 'flush-top' | 'flush';
  }>(),
  { back: true, padding: 'normal' },
);

const router = useRouter();

/** 字面量映射而非模板串拼接：Tailwind 需要能扫到完整类名 */
const PAD_CLASS: Record<'normal' | 'flush-top' | 'flush', string> = {
  normal: 'px-4 pt-4 pb-2',
  'flush-top': 'px-4 pt-0 pb-2',
  flush: 'px-4 pt-0 pb-0',
};
</script>

<template>
  <div class="flex flex-col bg-page h-full w-full max-w-[480px] mx-auto relative overflow-hidden">
    <NavBar :title="title" :show-back="back" @back="router.back()" />

    <div
      class="flex-1 overflow-y-auto no-scrollbar overscroll-contain"
      :class="PAD_CLASS[padding]"
    >
      <slot />
    </div>
  </div>
</template>
