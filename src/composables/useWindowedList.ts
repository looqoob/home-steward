/**
 * 长列表窗口化渲染（v1.1 F14 自 StockView 抽公用）。
 *
 * 背景：掉帧主因是 DOM 数量而非排序计算（几百量级的 O(n log n) 是毫秒级）。
 * 采用**增量窗口**而非回收式虚拟滚动：组卡 / 日志行高度可变、分组头 sticky
 * 依赖各自包含块，回收式偏移计算会大面积重写 F8/F9 滚动体系；
 * 窗口化零偏移计算、零滚动跳动，代价（滚过的不回收）在几百条规模下可接受。
 *
 * 用法（配合 TabPageBody 的 scroll 转发）：
 * ```ts
 * const win = useWindowedList({ total: () => rows.value.length, resetOn: [keyword] });
 * // 模板：<TabPageBody @scroll="win.onScroll">…列表用 rows.slice(0, win.visibleCount.value)…
 * //      尾部提示：v-if="win.hasMore.value"（模板里自动解包 win.hasMore）
 * ```
 *
 * @param total 当前总条数（getter，响应式）
 * @param resetOn 触发窗口重置的依赖（筛选 / 搜索 / 视图切换——新结果集排序完全不同，
 *                保留大窗口会让首屏一次渲染几百条，失去窗口化意义）
 */
import { computed, ref, watch, type WatchSource } from 'vue';

export function useWindowedList(options: {
  total: () => number;
  resetOn: WatchSource[];
  /** 初始窗口大小（首屏渲染条数），默认 40 */
  initial?: number;
  /** 每次触底追加的条数，默认 30 */
  batch?: number;
  /** 距底部多少 px 开始追加（约两屏提前量），默认 600 */
  triggerPx?: number;
}) {
  const { total, resetOn, initial = 40, batch = 30, triggerPx = 600 } = options;

  const visibleCount = ref(initial);
  const hasMore = computed(() => visibleCount.value < total());

  let rafPending = false;
  /** rAF 节流的触底追加：绑定到滚动容器的 scroll 事件（event.target 即容器） */
  function onScroll(ev: Event) {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(() => {
      rafPending = false;
      if (!hasMore.value) return;
      const el = ev.target as HTMLElement;
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - triggerPx) {
        visibleCount.value += batch;
      }
    });
  }

  watch(resetOn, () => {
    visibleCount.value = initial;
  });

  return { visibleCount, hasMore, onScroll };
}
