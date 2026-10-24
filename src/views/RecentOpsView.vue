<script setup lang="ts">
/**
 * 最近操作（v1.1 F1）：把「撤销」从 toast 的 5 秒单槽位升级成一份可回滚的操作列表。
 *
 * 数据源就是 `ConsumeLog`（每次消耗的完整流水），**不需要新表**：倒序取最近 N 条，
 * 每条可单独撤销（`items.undoConsume` 按数量对账回滚，见 stores/items）。
 *
 * 两条边界：
 * - 物品已被删除的日志**不可撤销**（撤销要写回物品数量，物品没了就无从回滚）——按钮置灰并说明；
 * - toast 上的「撤销整批」（`undoBulk`）快照只在内存，刷新即失效；本页按**单条日志**回滚，
 *   批量操作产生的多条日志在这里逐条撤销即可，不受快照失效影响。
 */
import { computed } from 'vue';
import PageShell from '@/components/PageShell.vue';
import EmptyState from '@/components/EmptyState.vue';
import { useItemsStore } from '@/stores/items';
import type { ConsumeLog } from '@/domain/types';
import { fromEpoch } from '@/domain/dates';
import { fmtMoney, normalizePrice } from '@/domain/price';
import { fmtQty } from '@/domain/quantity';
import { useToday } from '@/composables/useNow';
import { useToast } from '@/composables/useToast';

const items = useItemsStore();
const { show } = useToast();
const today = useToday();

/** 展示条数：撤销是「刚手滑」的补救动作，太久远的操作不该再动 */
const LIMIT = 30;

const rows = computed<ConsumeLog[]>(() =>
  items.logs
    .filter((l) => !l.deletedAt)
    .slice()
    .sort((a, b) => b.at - a.at)
    .slice(0, LIMIT),
);

/** 该日志的物品是否还在（含已用完；撤销会把它写回 in_stock）——被删除的物品无从回滚 */
function itemAlive(log: ConsumeLog): boolean {
  return items.list.some((i) => i.id === log.itemId);
}

const undoing = new Set<string>();

async function undo(log: ConsumeLog) {
  if (undoing.has(log.id) || !itemAlive(log)) return;
  undoing.add(log.id);
  try {
    await items.undoConsume(log.id);
    show(`已撤销：${log.name} ${fmtQty(log.quantity)}${log.unit}`, 2200);
  } finally {
    undoing.delete(log.id);
  }
}

/** 「今天 14:32」/「10-22 09:05」 */
function timeText(at: number): string {
  const day = fromEpoch(at);
  const d = new Date(at);
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return day === today.value ? `今天 ${hm}` : `${day.slice(5).replace('-', '月')}日 ${hm}`;
}

function amountText(log: ConsumeLog): string {
  // fmtMoney（v1.1 F14）：两位小数与消耗明细 / 统计同一口径；没填价返回空串由调用方过滤
  const p = normalizePrice(log.price);
  return p === null ? '' : fmtMoney(p);
}
</script>

<template>
  <PageShell title="最近操作">
    <div class="tip mb-3.5">
      最近 {{ LIMIT }} 条「用掉 / 扔掉」记录，可逐条撤销（数量按对账规则回滚）。撤销「扔掉」不会把钱退回来，只是从统计里移除该记录。
    </div>

    <EmptyState v-if="rows.length === 0" text="还没有消耗记录">
      <template #icon>
        <svg class="icon icon-ill" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <polyline points="12 7 12 12 15.5 14" />
        </svg>
      </template>
    </EmptyState>

    <div
      v-for="l in rows"
      :key="l.id"
      class="flex items-center gap-3 card px-3 py-2.5 mb-2 shadow-card"
    >
      <span class="w-9 h-9 rounded-md flex-none flex items-center justify-center text-[15px] font-medium text-ink-2 bg-sunken">{{ l.name.slice(0, 1) }}</span>
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2 min-w-0">
          <span class="text-[14px] font-medium text-ink-1 truncate">{{ l.name }}</span>
          <!-- audit-ignore: freshness-badge（用掉/扔掉是类型徽标，非新鲜度六态；primary-50 不在 FreshnessBadge 色系） -->
          <span
            :class="l.type === 'wasted' ? 'bg-over-bg text-over-fg' : 'bg-primary-50 text-primary-700'"
          >{{ l.type === 'wasted' ? '扔掉' : '用掉' }}</span>
        </div>
        <div class="text-[12px] text-ink-3 mt-0.5 flex items-center gap-1.5 flex-wrap">
          <span>{{ fmtQty(l.quantity) }} {{ l.unit }}</span>
          <span v-if="amountText(l)" class="tabular-nums">{{ amountText(l) }}</span>
          <span>· {{ timeText(l.at) }}</span>
        </div>
      </div>
      <button
        type="button"
        class="relative flex-none text-[12px] text-primary-700 border border-primary-600 rounded-full px-2.5 py-1 cursor-pointer min-h-9 before:absolute before:content-[''] before:-inset-2 disabled:opacity-40 disabled:cursor-not-allowed"
        :disabled="!itemAlive(l) || undoing.has(l.id)"
        :aria-label="itemAlive(l) ? `撤销「${l.name}」这条记录` : `「${l.name}」的物品已删除，无法撤销`"
        @click="undo(l)"
      >{{ itemAlive(l) ? '撤销' : '已失效' }}</button>
    </div>
  </PageShell>
</template>
