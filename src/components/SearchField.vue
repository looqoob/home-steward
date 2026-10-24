<script setup lang="ts">
/**
 * 列表页搜索框：胶囊外框 + 放大镜图标 + 原生 `<input>`，`v-model` 双向绑定关键字。
 *
 * 为什么不用 `van-search`：Vant 的 Search 由 `van-cell` + `van-field` 两层拼成，
 * 内部有各自的固定行高与上下内边距（`--van-cell-vertical-padding`），
 * 结果是整框偏高、图标与占位文字相对输入区不居中，只能靠一串 `--van-search-*` 变量去凑。
 * 换成原生 input 后，`items-center` 真正生效、高度由本组件一处决定，也不再需要那串覆盖变量。
 */
defineProps<{
  /** 当前关键字 */
  modelValue: string;
  /** 占位文字，同时作为输入框的无障碍名称 */
  placeholder?: string;
}>();

const emit = defineEmits<{ (e: 'update:modelValue', v: string): void }>();

function onInput(e: Event) {
  emit('update:modelValue', (e.target as HTMLInputElement).value);
}
</script>

<template>
  <div
    class="flex items-center gap-2 h-10 px-3 rounded-full bg-sunken border border-line transition-colors focus-within:border-primary-500 focus-within:ring-2 focus-within:ring-primary-50"
  >
    <svg class="icon icon-sm flex-none text-ink-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <line x1="16.4" y1="16.4" x2="21" y2="21" />
    </svg>
    <!--
      用 type="text" + inputmode/enterkeyhint=search，而不是 type="search"：
      后者在 iOS/桌面 WebKit 上会自带一个不受控的原生清除按钮与圆角样式，跨端表现不一致。
      焦点可见环由外层容器的 focus-within 提供，所以这里关掉 input 自己的 outline。
    -->
    <input
      :value="modelValue"
      type="text"
      inputmode="search"
      enterkeyhint="search"
      :placeholder="placeholder"
      :aria-label="placeholder || '搜索'"
      class="flex-1 min-w-0 h-full bg-transparent border-0 text-[16px] text-ink-1 placeholder:text-ink-3 focus:outline-none"
      @input="onInput"
    />
    <!-- ⚠️ 输入类字号必须 ≥16px：iOS Safari 对小于 16px 的输入框聚焦时会整页放大且失焦不还原（REV-17）。
         视觉上的「小」靠外框高度与内边距控制，不靠字号。 -->
  </div>
</template>
