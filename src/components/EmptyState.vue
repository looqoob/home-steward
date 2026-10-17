<script setup lang="ts">
/**
 * 空状态：可选插画 + 一行说明 + 可选行动按钮。
 *
 * 此前 6 处各写一份 `text-center py-12 px-6 text-[13px] text-ink-3` 加一个 56px 的
 * 浅色圆底当插画容器。重复本身不算严重，问题是「有插画 / 没插画」两种写法的间距
 * 不一致（有的 `mb-3`，有的直接贴文字），以及行动按钮的 `mt-3.5` 有时挂在按钮上、
 * 有时挂在包裹 div 上。
 *
 * 插画用 `#icon` 插槽传入（各页图标本来就是内容，不属于布局），
 * 统一由组件负责 56px 圆底与 `mb-3`。
 */
defineProps<{ text?: string }>();
</script>

<template>
  <div class="text-center py-12 px-6 text-[13px] text-ink-3">
    <div
      v-if="$slots.icon"
      class="w-14 h-14 rounded-full bg-sunken flex items-center justify-center mx-auto mb-3 text-ink-3"
    >
      <slot name="icon" />
    </div>

    <slot>{{ text }}</slot>

    <div v-if="$slots.action" class="mt-3.5 flex justify-center">
      <slot name="action" />
    </div>
  </div>
</template>
