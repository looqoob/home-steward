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
    <div class="note">
      清单根据库存与消耗自动生成；手动项不会被自动清理。
    </div>

    <div class="field" style="display: flex; gap: 8px; align-items: flex-end">
      <div style="flex: 1">
        <label>手动添加</label>
        <input v-model="manualName" class="input" placeholder="如 抽纸" @keyup.enter="addManual" />
      </div>
      <button class="btn btn-primary" style="width: auto; padding: 0 18px" @click="addManual">添加</button>
    </div>

    <div v-if="shopping.visible.length === 0" class="empty">
      <div class="ic">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="9 11 12 14 22 4" />
          <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
        </svg>
      </div>
      暂无需购买的物品
    </div>

    <template v-for="g in groups" :key="g.reason">
      <div class="group-head">
        <span>{{ g.label }}</span>
        <span class="cnt">{{ g.items.length }}</span>
      </div>
      <div
        v-for="s in g.items"
        :key="s.id"
        class="list-item"
        :class="{ done: s.checked }"
      >
        <div
          class="checkbox"
          :class="{ on: s.checked }"
          role="checkbox"
          :aria-checked="s.checked"
          @click="toggle(s.id)"
        >✓</div>
        <div style="flex: 1; min-width: 0">
          <div class="name">{{ s.name }}</div>
          <div class="why">{{ g.label }}<span v-if="s.unit"> · {{ s.unit }}</span></div>
        </div>
        <button class="icon-btn" aria-label="移除" @click="remove(s.id)">✕</button>
      </div>
    </template>

    <button
      v-if="shopping.done.length > 0"
      class="btn btn-ghost"
      style="margin-top: 12px"
      @click="clearDone"
    >
      清除已购（{{ shopping.done.length }}）
    </button>
  </div>
</template>
