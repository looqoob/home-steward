<script setup lang="ts">
import { computed, ref } from 'vue';
import { useShoppingStore } from '@/stores/shopping';
import { REASON_LABEL } from '@/domain/shoppingRules';
import type { ShopReason } from '@/domain/types';

const shopping = useShoppingStore();
const manualName = ref('');

const groups = computed(() => {
  const order: ShopReason[] = ['out_of_stock', 'near_expiry', 'frequent_waste', 'manual'];
  return order
    .map((r) => ({
      reason: r,
      label: REASON_LABEL[r],
      items: shopping.visible.filter((s) => s.reason === r),
    }))
    .filter((g) => g.items.length > 0);
});

async function toggle(id: string) {
  await shopping.toggle(id);
}

async function remove(id: string) {
  await shopping.remove(id);
}

async function addManual() {
  const n = manualName.value.trim();
  if (!n) return;
  await shopping.addManual(n);
  manualName.value = '';
}

async function clearDone() {
  await shopping.clearDone();
}
</script>

<template>
  <div>
    <!-- 与库存页保持同一套页头节奏：标题 + 右侧计数 -->
    <div class="flex items-baseline justify-between gap-2 mb-3">
      <h1 class="text-[20px] font-semibold leading-[1.2]">清单</h1>
      <span class="text-[12px] text-ink-3 whitespace-nowrap">需买 {{ shopping.visible.length }} 件</span>
    </div>

    <div class="text-[12px] text-ink-2 bg-sunken rounded-md p-2.5 mb-3.5 leading-relaxed">
      清单根据库存与消耗自动生成；手动项不会被自动清理。
    </div>

    <!-- 用项目自己的输入样式（label 在上 + 原生 input），不用 van-field：后者的固定宽度标签会挤压输入区 -->
    <div class="mb-3.5">
      <label class="block text-[12px] text-ink-2 mb-1.5" for="manual-name">手动添加</label>
      <div class="flex gap-2">
        <input
          id="manual-name"
          v-model="manualName"
          class="flex-1 min-w-0 h-11 border border-line-strong rounded-md px-3 text-[14px] bg-card text-ink-1 placeholder:text-ink-3 focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-50"
          placeholder="如 抽纸"
          @keyup.enter="addManual"
        />
        <van-button type="primary" class="flex-none" @click="addManual">添加</van-button>
      </div>
    </div>

    <div v-if="shopping.visible.length === 0" class="text-center py-12 px-6 text-[13px] text-ink-3">
      <div class="w-14 h-14 rounded-full bg-sunken flex items-center justify-center mx-auto mb-3 text-ink-3">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="9 11 12 14 22 4" />
          <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
        </svg>
      </div>
      暂无需购买的物品
    </div>

    <template v-for="g in groups" :key="g.reason">
      <div class="flex items-center gap-2 text-[13px] font-medium text-ink-1 mt-3 mb-2">
        <span>{{ g.label }}</span>
        <span class="text-[12px] text-ink-3 font-normal">{{ g.items.length }}</span>
      </div>
      <div
        v-for="s in g.items"
        :key="s.id"
        class="bg-card border border-line rounded-md p-3 mb-2 flex items-center gap-3 shadow-card"
        :class="{ 'opacity-60': s.checked }"
      >
        <button
          type="button"
          class="relative w-[22px] h-[22px] rounded-md border flex-none flex items-center justify-center text-[12px] leading-none cursor-pointer before:absolute before:content-[''] before:-inset-2"
          :class="s.checked ? 'bg-primary-600 border-primary-600 text-white' : 'bg-card border-line-strong text-transparent'"
          role="checkbox"
          :aria-checked="s.checked"
          :aria-label="`标记「${s.name}」为已购买`"
          @click="toggle(s.id)"
        >✓</button>
        <div class="flex-1 min-w-0">
          <div class="text-[14px] font-medium truncate" :class="s.checked ? 'text-ink-3 line-through' : 'text-ink-1'">{{ s.name }}</div>
          <div class="text-[12px] text-ink-3 mt-0.5 truncate">{{ g.label }}<span v-if="s.unit"> · {{ s.unit }}</span></div>
        </div>
        <button
          type="button"
          class="relative w-8 h-8 flex items-center justify-center rounded-md text-ink-3 cursor-pointer before:absolute before:content-[''] before:-inset-2 disabled:opacity-40"
          :disabled="false"
          aria-label="移除"
          @click="remove(s.id)"
        >✕</button>
      </div>
    </template>

    <van-button
      v-if="shopping.done.length > 0"
      block
      class="mt-3"
      @click="clearDone"
    >
      清除已购（{{ shopping.done.length }}）
    </van-button>
  </div>
</template>
