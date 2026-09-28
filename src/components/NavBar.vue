<script setup lang="ts">
defineProps<{ title: string; showBack?: boolean }>();
const emit = defineEmits<{ (e: 'back'): void }>();
</script>

<template>
  <div class="navbar">
    <button v-if="showBack" class="icon-btn" aria-label="返回" @click="emit('back')">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="15 18 9 12 15 6" />
      </svg>
    </button>
    <span v-else class="spacer"></span>
    <h2>{{ title }}</h2>
    <span class="spacer"></span>
  </div>
</template>

<style scoped lang="scss">
/*
 * 让纯白顶栏向上延伸覆盖到状态栏区域，避免刘海机型顶部露出 .screen 的灰色缝隙。
 * 负 margin 顶到视口最顶，再用等量的 padding-top 把内容压回状态栏下方。
 * border-box 下显式加上安全区高度，保证内容区仍是 48px。
 */
.navbar {
  margin-top: calc(-1 * env(safe-area-inset-top, 0px));
  padding-top: calc(env(safe-area-inset-top, 0px));
  height: calc(48px + env(safe-area-inset-top, 0px));
}
</style>
