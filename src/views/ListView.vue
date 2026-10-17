<script setup lang="ts">
import { computed, ref } from 'vue';
import { useShoppingStore } from '@/stores/shopping';
import { useItemsStore } from '@/stores/items';
import { useLocationsStore } from '@/stores/locations';
import ConfirmSheet from '@/components/ConfirmSheet.vue';
import ShoppingInboundRow from '@/components/ShoppingInboundRow.vue';
import { REASON_LABEL, groupShoppingByLocation } from '@/domain/shoppingRules';
import type { ShopReason, ShoppingItem } from '@/domain/types';
import { useToast } from '@/composables/useToast';

const shopping = useShoppingStore();
const items = useItemsStore();
const locations = useLocationsStore();
const { show } = useToast();
const manualName = ref('');

/**
 * 清单的两种分组维度（V3-01）。
 *
 * 选 `local` 而不是塞进路由 query：分组方式是一次性的浏览偏好，
 * 用户不会想「把这个链接发给朋友看我的按位置清单」，不值得占用可分享的 URL。
 */
type GroupBy = 'reason' | 'location';
const groupBy = ref<GroupBy>('reason');

/** 统一成一个形状：{ key, label, items }，模板不用为两种维度写两套渲染 */
const groups = computed(() => {
  if (groupBy.value === 'location') {
    return groupShoppingByLocation(shopping.visible, locations.all).map((g) => ({
      key: g.locationId ?? '__none',
      label: g.label,
      items: g.items,
    }));
  }
  const order: ShopReason[] = ['out_of_stock', 'near_expiry', 'frequent_waste', 'manual'];
  return order
    .map((r) => ({
      key: r,
      label: REASON_LABEL[r],
      items: shopping.visible.filter((s) => s.reason === r),
    }))
    .filter((g) => g.items.length > 0);
});

/* ==================== 一键入库 ==================== */

/**
 * 当前展开了入库卡的清单项 id。
 *
 * 只允许**一张**同时展开（`string | null` 而非 `Set`）：并排展开会把列表撑得很长，
 * 而实际使用是「勾一件、放一件、再勾下一件」，一次只处理一件更顺手。
 */
const openInboundId = ref<string | null>(null);

/**
 * 只负责**展开**行内入库卡（「入库」按钮走这里）。
 *
 * ⚠️ 它**不碰勾选态**。原先勾选与展开挤在同一个函数里：
 * `openInboundId` 收起时提前 `return`，把后面的 `toggle` 一起跳过了 ——
 * 于是「第二次点击只收起卡片、勾选原封不动」，表现就是勾上就取消不了。
 * 两个动作拆开后，勾选由 `toggleCheck` 单独负责，行为才对称。
 */
function toggleInbound(s: ShoppingItem) {
  openInboundId.value = openInboundId.value === s.id ? null : s.id;
}

/**
 * 勾选 / 取消勾选。点一下勾上，再点一下取消，取消后不残留。
 *
 * @param s 模板传进来的是**点击前**的快照（`shopping.toggle` 内部会 `load()` 换掉对象），
 *          所以它的 `checked` 表示「切换前」的状态，正好用来判断这次是勾上还是取消。
 */
async function toggleCheck(s: ShoppingItem) {
  // 已入库的项不能直接取消勾选：物品已经在库存里了，清单再说「没买」就对不上账。
  // 想反悔要先撤销入库（行内有「撤销」）。
  if (s.inboundItemId) {
    show(`「${s.name}」已入库，请先撤销入库`);
    return;
  }
  const wasChecked = s.checked;
  await shopping.toggle(s.id);
  if (wasChecked) {
    // 取消勾选必须收起入库卡，否则留下一张「已取消但还在填」的表单
    openInboundId.value = null;
  } else {
    // 勾选即展开，保留原来「一步到位」的手感
    openInboundId.value = s.id;
  }
}

async function doInbound(s: ShoppingItem, quantity: number, locationId: string, price: number | null) {
  const item = await shopping.inboundOne(s.id, quantity, locationId, price);
  if (!item) {
    show('入库失败，请检查位置设置');
    return;
  }
  openInboundId.value = null;
  show(`已入库：${item.name} ${item.quantity}${item.unit}`, 2200, {
    text: '撤销',
    run: async () => {
      const snap = await shopping.undoInbound(s.id);
      if (snap) await items.restore(snap);
    },
  });
}

async function undoInbound(s: ShoppingItem) {
  const snap = await shopping.undoInbound(s.id);
  if (!snap) return;
  await items.restore(snap);
  show('已撤销入库');
}

/** 已勾选但未入库的项（底部「全部入库」的作用对象） */
const doneNotInbound = computed(() =>
  shopping.done.filter((s) => !s.inboundItemId),
);

async function inboundAllDone() {
  const ids = doneNotInbound.value.map((s) => s.id);
  if (!ids.length) return;
  const { count, skipped } = await shopping.inboundAll(ids);
  if (!count) {
    show('没有可入库的项，请检查位置是否已启用');
    return;
  }
  // 跳过的必须如实告知，不能静默丢弃
  show(
    skipped.length
      ? `已入库 ${count} 件，${skipped.length} 项未入库（缺少可用位置）`
      : `已入库 ${count} 件`,
    skipped.length ? 3500 : 2200,
  );
}

/**
 * 删除走二次确认 + Toast 撤销。
 *
 * 为什么加确认：清单一行的「✕」只有 22px，旁边紧挨着勾选框，手滑点到的概率不低；
 * 而自动项被删后 7 天内不会重生（`dismissedUntil`），误删的代价是「想买的菜消失一周」。
 * 撤销用 `remove()` 返回的快照回写，和物资删除的处理方式保持一致。
 */
const confirmRemove = ref<ShoppingItem | null>(null);

async function doRemove() {
  const target = confirmRemove.value;
  confirmRemove.value = null;
  if (!target) return;
  const snapshot = await shopping.remove(target.id);
  show('已移除', 2200, snapshot ? { text: '撤销', run: () => shopping.restore(snapshot) } : undefined);
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
    <!-- 顶部 16px 间距，与库存页一致：滚动容器 pt-0（吸顶筛选条需要），间距改由普通流占位元素提供 -->
    <div class="h-4" aria-hidden="true"></div>

    <!-- 与库存页保持同一套页头节奏：标题 + 右侧计数 -->
    <div class="flex items-baseline justify-between gap-2 mb-3">
      <h1 class="text-[20px] font-semibold leading-[1.2]">清单</h1>
      <span class="text-[12px] text-ink-3 whitespace-nowrap">需买 {{ shopping.visible.length }} 件</span>
    </div>

    <div class="tip mb-3.5">
      清单根据库存与消耗自动生成；手动项不会被自动清理。
    </div>

    <!--
      分组维度切换（V3-01）。只有一项时也显示：让用户看到「还有另一种看法」，
      代价只是一行 28px 的按钮；藏起来的话这个功能等于不存在。
    -->
    <div class="flex gap-1 mb-3" role="group" aria-label="清单分组方式">
      <button
        v-for="g in ([['reason', '按原因'], ['location', '按位置']] as const)"
        :key="g[0]"
        type="button"
        class="text-[13px] border rounded-full px-3 py-1 min-h-10 cursor-pointer"
        :class="groupBy === g[0]
          ? 'bg-primary-600 border-primary-600 text-white font-medium'
          : 'bg-card border-line text-ink-2'"
        :aria-pressed="groupBy === g[0]"
        @click="groupBy = g[0]"
      >{{ g[1] }}</button>
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
        <svg class="icon icon-ill" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="9 11 12 14 22 4" />
          <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
        </svg>
      </div>
      暂无需购买的物品
    </div>

    <template v-for="g in groups" :key="g.key">
      <div class="flex items-center gap-2 text-[13px] font-medium text-ink-1 mt-3 mb-2">
        <span>{{ g.label }}</span>
        <span class="text-[12px] text-ink-3 font-normal">{{ g.items.length }}</span>
      </div>
      <div
        v-for="s in g.items"
        :key="s.id"
        class="card p-3 mb-2 shadow-card"
        :class="s.inboundItemId
          ? 'border-line'
          : openInboundId === s.id
            ? 'border-primary-600'
            : 'border-line'"
      >
        <div class="flex items-center gap-3">
          <button
            type="button"
            class="relative w-[22px] h-[22px] rounded-md border flex-none flex items-center justify-center text-[12px] leading-none cursor-pointer before:absolute before:content-[''] before:-inset-2"
            :class="s.inboundItemId
              ? 'bg-primary-600 border-primary-600 text-white opacity-60'
              : s.checked
                ? 'bg-primary-600 border-primary-600 text-white'
                : 'bg-card border-line-strong text-transparent'"
            role="checkbox"
            :aria-checked="s.checked"
            :aria-label="s.checked ? `取消勾选「${s.name}」` : `标记「${s.name}」为已购买`"
            :aria-expanded="openInboundId === s.id"
            @click="toggleCheck(s)"
          >✓</button>
          <div class="flex-1 min-w-0">
            <div class="text-[14px] font-medium truncate" :class="s.checked && !s.inboundItemId ? 'text-ink-3' : 'text-ink-1'">{{ s.name }}</div>
            <div class="text-[12px] text-ink-3 mt-0.5 truncate">
              <!-- 按位置分组时，原因只作为副标签出现（主标签已经是位置了） -->
              <template v-if="groupBy === 'reason'">{{ g.label }}</template>
              <template v-else>{{ REASON_LABEL[s.reason] }}</template>
              <span v-if="s.unit"> · {{ s.unit }}</span>
              <span v-if="s.quantity"> · 建议 {{ s.quantity }}</span>
            </div>
          </div>
          <!-- 未入库的已购项给一个「入库」直达按钮，展开卡只为想改数量/位置的人服务 -->
          <button
            v-if="s.checked && !s.inboundItemId"
            type="button"
            class="flex-none text-[12px] text-primary-700 border border-primary-600 rounded-full px-2.5 py-1 cursor-pointer min-h-10"
            :aria-label="`入库「${s.name}」`"
            @click="toggleInbound(s)"
          >入库</button>
          <button
            type="button"
            class="relative w-8 h-8 flex items-center justify-center rounded-md text-ink-3 cursor-pointer before:absolute before:content-[''] before:-inset-2 disabled:opacity-40"
            :disabled="false"
            :aria-label="`移除「${s.name}」`"
            @click="confirmRemove = s"
          >✕</button>
        </div>

        <!-- 行内入库卡：只在展开时渲染，勾选状态为真但未入库时才显示表单 -->
        <ShoppingInboundRow
          v-if="openInboundId === s.id && !s.inboundItemId"
          :item="s"
          :inbound="false"
          @inbound="(q, l, p) => doInbound(s, q, l, p)"
          @dismiss="openInboundId = null"
          @undo="undoInbound(s)"
        />
        <ShoppingInboundRow
          v-else-if="s.inboundItemId"
          :item="s"
          :inbound="true"
          @undo="undoInbound(s)"
        />
      </div>
    </template>

    <!--
      批量条：已购但未入库的项走「全部入库」，其余走「清除已购」。
      两者语义不同，所以分开成两个按钮而不是合并 —— 勾上不代表一定要入库（也许先放门口）。
    -->
    <div
      v-if="shopping.done.length > 0"
      class="flex items-center justify-between gap-2 card px-3 py-2.5 mt-3"
    >
      <span class="text-[13px] text-ink-1 flex-none">已购 {{ shopping.done.length }} 件</span>
      <div class="flex gap-2 min-w-0">
        <button
          v-if="doneNotInbound.length > 0"
          type="button"
          class="text-[13px] text-primary-700 cursor-pointer min-h-10 px-1"
          @click="inboundAllDone"
        >全部入库（{{ doneNotInbound.length }}）</button>
        <button
          type="button"
          class="text-[13px] text-ink-2 cursor-pointer min-h-10 px-1"
          @click="clearDone"
        >清除</button>
      </div>
    </div>

    <ConfirmSheet
      :model-value="confirmRemove !== null"
      title="移除清单项"
      :message="confirmRemove
        ? `「${confirmRemove.name}」将从清单移除。${confirmRemove.auto ? '自动建议 7 天内不会再次出现，可撤销。' : ''}`
        : ''"
      confirm-text="移除"
      danger
      @update:model-value="confirmRemove = null"
      @confirm="doRemove"
    />
  </div>
</template>
