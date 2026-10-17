import { onBeforeUnmount, onMounted, ref } from 'vue';

/**
 * 吸顶筛选条的实测高度，用作分组头 `sticky top` 的偏移量。
 *
 * 为什么不写死像素：筛选条的高度受三件事影响 —— 日期/位置胶囊数量（窄屏会换行）、
 * 系统字体缩放、以及各页筛选条自身的行数。写死 52px 时分组头会被筛选条压住半截；
 * 写死偏大则会在两条之间露出一条缝，滚动中的卡片从缝里穿过去。
 *
 * 约定（详见 styles/README.md「吸顶层约定」）：
 * - 滚动容器 `pt-0`，顶部留白改由页面内的普通流占位元素提供，sticky 才能贴住容器顶边
 * - 本 composable 返回的高度是**内容高度**，调用点自行 `-1px` 做 1px 重叠，杜绝亚像素发丝缝
 *
 * 用法：
 * ```ts
 * const { filterEl, filterH } = useStickyFilterOffset();
 * const groupTop = computed(() => `${Math.max(0, Math.round(filterH.value) - 1)}px`);
 * ```
 * ```html
 * <div ref="filterEl" class="sticky top-[-1px] z-20 bg-page ...">…</div>
 * ```
 */
export function useStickyFilterOffset() {
  const filterEl = ref<HTMLElement | null>(null);
  /**
   * 初始值只是首帧的估计（搜索框 36 + 间距 + 一行胶囊 ≈ 56）。
   * `onMounted` 后立刻用实测值覆盖，所以它只影响「挂载前那一帧」的偏移。
   */
  const filterH = ref(56);
  let ro: ResizeObserver | null = null;

  function measure() {
    const el = filterEl.value;
    // 筛选条可能被 `v-if` 移除（多选 / 盘点态）：此时保留上一次的值，
    // 由调用点决定是否改用「直接贴容器顶」的偏移。
    if (el) filterH.value = el.getBoundingClientRect().height;
  }

  onMounted(() => {
    measure();
    // ResizeObserver 在极老的 WebView 上可能不存在，此时退化为「挂载时测一次」
    if (filterEl.value && typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(measure);
      ro.observe(filterEl.value);
    }
  });

  onBeforeUnmount(() => {
    ro?.disconnect();
    ro = null;
  });

  return { filterEl, filterH, measure };
}
