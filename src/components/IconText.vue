<script setup lang="ts">
/**
 * 图标 + 文本 排版原语。
 *
 * 规范全文见 `docs/ICON-TEXT-SPEC.md`，这里只说三个必须记住的点：
 *
 * 1. **图标必须走 `icon` slot**，并自带档位类（`.icon .icon-sm` 等）——
 *    本组件不猜图标尺寸，尺寸由调用点决定（与文字同排用 sm，独立按钮用 md）。
 * 2. **`lh` 必须与文本实际行高一致**。它同时喂给文本的 `line-height` 和图标盒的
 *    `height`，两边相等才能保证「图标光学中心 = 文本行盒中心」。
 *    如果文本在外部被 Tailwind 的 `leading-*` 改了行高，这里也要传同样的值，否则图标会偏。
 * 3. **多行文本传 `top`**。默认是把图标相对整块内容居中，多行时会掉到中间；
 *    `top` 改成顶部对齐，图标才对齐**第一行**。
 *
 * 只想要样式不要组件时，直接用 `.it` / `.it-icon` / `.it-text` 三个类即可，规则完全相同。
 */
import { computed, type StyleValue } from 'vue';

const props = withDefaults(
  defineProps<{
    /** 文本行高倍数，必须与文本的 line-height 一致 */
    lh?: number;
    /** 图标与文本的间距（px） */
    gap?: number;
    /** 多行文本：图标顶部对齐（对齐第一行）而不是整块居中 */
    top?: boolean;
  }>(),
  { lh: 1.6, gap: 6, top: false },
);

const style = computed<StyleValue>(() => ({
  '--it-lh': String(props.lh),
  '--it-gap': `${props.gap}px`,
}));
</script>

<template>
  <span class="it" :class="{ 'it-top': top }" :style="style">
    <span class="it-icon"><slot name="icon" /></span>
    <!--
      `it-text` 只负责 `min-width: 0`（长文本在 flex 里能正常截断）。
      不在这里设行高 —— 行高由 .it 的 line-height 继承下来，与图标盒共用同一个 --it-lh。
    -->
    <span class="it-text"><slot /></span>
  </span>
</template>
