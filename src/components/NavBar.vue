<script setup lang="ts">
defineProps<{ title: string; showBack?: boolean }>();
const emit = defineEmits<{ (e: 'back'): void }>();
</script>

<template>
  <!--
    标题行的 48px 之外再叠加顶部安全区：`pt` 撑出状态栏 / 刘海高度、`h-calc` 把总高补到 48px + 安全区，
    否则在 PWA / APK（`viewport-fit=cover`，且原生壳是 edge-to-edge）下返回按钮会被状态栏压住、点不到。
    ⚠️ 用 `var(--safe-top)` 而不是 `env(safe-area-inset-top)`：后者在 Android WebView 里恒为 0，
    真值由 `composables/useSafeArea.ts` 量好写到 `<html>` 上（拿不到时按平台给兜底值）。
    所有二级页的顶栏都走这里（页面自渲染 / PageShell / TabLayout 外壳），改这一处即全局生效。
  -->
  <div
    class="flex items-center justify-between px-4 pt-[var(--safe-top)] h-[calc(48px+var(--safe-top))] bg-card border-b border-line gap-2 flex-none"
  >
    <button
      v-if="showBack"
      type="button"
      class="relative w-8 h-8 flex items-center justify-center rounded-md text-ink-2 hover:bg-sunken before:absolute before:content-[''] before:-inset-2"
      aria-label="返回"
      @click="emit('back')"
    >
      <svg class="icon icon-md" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="15 18 9 12 15 6" />
      </svg>
    </button>
    <span v-else class="w-8"></span>
    <h2 class="text-[17px] font-semibold whitespace-nowrap overflow-hidden text-ellipsis flex-1 text-center">{{ title }}</h2>
    <span class="w-8"></span>
  </div>
</template>
