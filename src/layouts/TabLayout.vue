<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import QuickAddSheet from '@/components/QuickAddSheet.vue';

const route = useRoute();
const router = useRouter();

const isStock = computed(() => route.path.startsWith('/stock'));

/**
 * 快速入库弹框的开合由路由 query 驱动（?quickadd=1），而非普通的局部状态。
 * 打开时 push 一条历史记录，手机返回键回退掉这条记录即可关闭弹框，
 * 页面不会跳转（path 始终是 /stock）。
 */
const quickAddOpen = computed(() => route.query.quickadd === '1');

function openQuickAdd() {
  router.push({ path: '/stock', query: { quickadd: '1' } });
}

function closeQuickAdd() {
  // 仅当 query 仍在时才回退，避免与「自定义食材 / 新位置」的跳转互相打断
  if (route.query.quickadd) router.back();
}

function go(path: string) {
  if (!route.path.startsWith(path)) router.push(path);
}
</script>

<template>
  <div class="screen">
    <div class="topbar"></div>

    <div class="body has-tabbar">
      <router-view />
    </div>

    <div class="tabbar">
      <button :class="{ on: isStock }" @click="go('/stock')" aria-label="库存">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
          <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
          <line x1="12" y1="22.08" x2="12" y2="12" />
        </svg>
        库存
      </button>
      <button :class="{ on: route.path.startsWith('/list') }" @click="go('/list')" aria-label="清单">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
          <line x1="9" y1="6" x2="20" y2="6" />
          <line x1="9" y1="12" x2="20" y2="12" />
          <line x1="9" y1="18" x2="20" y2="18" />
          <circle cx="4.5" cy="6" r="1.4" />
          <circle cx="4.5" cy="12" r="1.4" />
          <circle cx="4.5" cy="18" r="1.4" />
        </svg>
        清单
      </button>
      <button :class="{ on: route.path.startsWith('/me') }" @click="go('/me')" aria-label="我的">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
        我的
      </button>

      <button v-if="isStock" class="fab" @click="openQuickAdd" aria-label="快速入库">
        <span style="font-size: 28px; line-height: 1">＋</span>
      </button>
    </div>

    <QuickAddSheet :model-value="quickAddOpen" @update:model-value="closeQuickAdd" />
  </div>
</template>

<style scoped lang="scss">
/* 去掉 .screen 自带的安全区留白，改由纯白 topbar 统一承担，避免顶部出现灰色缝隙 */
.screen {
  padding-top: 0;
}

.topbar {
  flex: none;
  background: #fff;
  height: calc(env(safe-area-inset-top, 0px) + 12px);
}
</style>
