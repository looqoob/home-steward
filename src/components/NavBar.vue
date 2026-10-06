<script setup lang="ts">
defineProps<{ title: string; showBack?: boolean }>();
const emit = defineEmits<{ (e: 'back'): void }>();
</script>

<template>
  <!--
    标题行的 48px 之外再叠加状态栏安全区：`pt` 撑出刘海高度、`h-calc` 把总高补到 48px + 安全区，
    否则在 PWA / APK（`viewport-fit=cover`）下标题会被状态栏压住。
    `env(safe-area-inset-top,0px)` 在普通浏览器里是 0，等于原来的 h-12，桌面端视觉不变。
  -->
  <div
    class="flex items-center justify-between px-4 pt-[env(safe-area-inset-top,0px)] h-[calc(48px+env(safe-area-inset-top,0px))] bg-card border-b border-line gap-2 flex-none"
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
