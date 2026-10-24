<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useItemsStore } from '@/stores/items';
import { useLocationsStore } from '@/stores/locations';
import { useSettingsStore } from '@/stores/settings';
import { buildTodayTodo, type TodoEntry } from '@/domain/todo';
import { useToday } from '@/composables/useNow';
import { ENV_MAP } from '@/domain/types';
import ConsumeSheet from '@/components/ConsumeSheet.vue';
import FreshnessBadge from '@/components/FreshnessBadge.vue';
import EnvDotLabel from '@/components/EnvDotLabel.vue';
import type { Item } from '@/domain/types';
import { useToast } from '@/composables/useToast';
import { useConsumeFlow } from '@/composables/useConsumeFlow';

/**
 * 是否在无待办时显示「今天没有待处理的物资」。
 *
 * 由调用方决定而非组件内写死：库存页空库时（压根没东西）不该显示这句，
 * 但处理完最后一条时应该给个收尾反馈。
 */
const props = withDefaults(defineProps<{ showEmpty?: boolean }>(), { showEmpty: true });

/**
 * 今日待办：把概览卡的数字变成一份**可以直接处理**的清单。
 *
 * 为什么不用弹层：处理「今天该吃什么」是高频动作，弹层会打断浏览；
 * 行内展开让用户逐条勾完，中途还能随时收起。
 */
const items = useItemsStore();
const locations = useLocationsStore();
const settings = useSettingsStore();
const { show } = useToast();

const today = useToday();

const entries = computed<TodoEntry[]>(
  () => buildTodayTodo(items.list, today.value, settings.settings),
);

/**
 * 折叠态：**默认收起**（v1.1 起调整）——待办常驻在概览数字里，
 * 区块默认只露一行标题，想逐条处理时再展开；处理完自动收回。
 * 手动展开只在会话内有效（`expanded`），不持久化。
 */
const expanded = ref(false);
watch(entries, (list) => {
  // 待办清空后收回展开态：下次有待办仍从「收起」开始
  if (!list.length) expanded.value = false;
});

const collapsed = computed(() => !expanded.value || entries.value.length === 0);

function locName(item: Item): string {
  return locations.byId(item.locationId)?.name ?? '';
}

function qtyText(item: Item): string {
  const q = item.quantity;
  const s = Number.isInteger(q) ? String(q) : String(Math.round(q * 100) / 100);
  return `${s}${item.unit}`;
}

/** 单件消耗动线（数量策略 / toast 撤销）统一走 useConsumeFlow（v1.1 F14）；解构出顶层 ref 供模板解包 */
const { target: consumeTarget, ask: askConsume, confirm: confirmConsume } = useConsumeFlow();

/**
 * 「明天再说」：延后 1 天不处理。
 *
 * 只写 `snoozeUntil`，**不改到期日** —— 物品仍留在库存列表的「紧急待吃」分组里，
 * 不会消失，只是不再打扰。该行立刻淡出（仅动 opacity/transform，200ms）。
 */
async function snooze(item: Item) {
  await items.snooze(item.id, 1);
  show(`已延后到明天：${item.name}`, 2200, {
    text: '撤销',
    run: () => items.unsnooze(item.id),
  });
}
</script>

<template>
  <section v-if="entries.length > 0" class="mb-3.5">
    <button
      type="button"
      class="flex items-center justify-between gap-2 w-full text-left card px-3 py-2.5 cursor-pointer mb-2"
      :aria-expanded="!collapsed"
      @click="expanded = !expanded"
    >
      <span class="text-[13px] font-medium text-ink-1">今日待办 {{ entries.length }} 件</span>
      <span class="text-[12px] text-ink-3">{{ collapsed ? '展开' : '收起' }}</span>
    </button>

    <div v-if="!collapsed" class="flex flex-col gap-2">
      <div
        v-for="e in entries"
        :key="e.item.id"
        class="border rounded-md px-3 py-2.5 transition-opacity duration-200"
        :class="e.state === 'over' ? 'bg-over-bg border-over-bg' : 'bg-urgent-bg border-urgent-bg'"
      >
        <div class="flex items-start justify-between gap-2 mb-2">
          <div class="min-w-0">
            <div class="text-[14px] font-medium text-ink-1 truncate">{{ e.item.name }}</div>
            <div class="flex items-center gap-1.5 text-[12px] text-ink-2 mt-0.5 flex-wrap">
              <span class="tabular-nums">{{ qtyText(e.item) }}</span>
              <EnvDotLabel
                v-if="locName(e.item)"
                tone="on-tint"
                :color="ENV_MAP[locations.byId(e.item.locationId)?.env ?? 'none'].color"
                :name="locName(e.item)"
              />
            </div>
          </div>
          <FreshnessBadge :state="e.state" :label="e.label" />
        </div>

        <!--
          v1.1 F10：过期行的按钮顺序对调，「扔掉」升级为红色实底主按钮。
          过期物的主导动作是「扔掉 + 记一笔浪费」（统计与「易浪费」建议都靠这份日志），
          「用掉」降为次要——刚过期一天有些人还会吃，但不再是默认动作。
          未过期行维持「用掉」优先。
        -->
        <div class="flex gap-2">
          <template v-if="e.state === 'over'">
            <button
              type="button"
              class="flex-1 inline-flex items-center justify-center gap-1 bg-danger border border-danger rounded-md text-[13px] text-white cursor-pointer min-h-11"
              :aria-label="`扔掉了${e.item.name}`"
              @click="askConsume(e.item, 'wasted')"
            >扔掉</button>
            <button
              type="button"
              class="flex-1 inline-flex items-center justify-center gap-1 bg-card border border-line-strong rounded-md text-[13px] text-primary-700 cursor-pointer min-h-11"
              :aria-label="`用掉了${e.item.name}`"
              @click="askConsume(e.item, 'consumed')"
            >用掉</button>
          </template>
          <template v-else>
            <button
              type="button"
              class="flex-1 inline-flex items-center justify-center gap-1 bg-card border border-line-strong rounded-md text-[13px] text-primary-700 cursor-pointer min-h-11"
              :aria-label="`用掉了${e.item.name}`"
              @click="askConsume(e.item, 'consumed')"
            >用掉</button>
            <button
              type="button"
              class="flex-1 inline-flex items-center justify-center gap-1 bg-card border border-line-strong rounded-md text-[13px] text-danger cursor-pointer min-h-11"
              :aria-label="`扔掉了${e.item.name}`"
              @click="askConsume(e.item, 'wasted')"
            >扔掉</button>
          </template>
          <button
            type="button"
            class="flex-1 inline-flex items-center justify-center gap-1 bg-card border border-line-strong rounded-md text-[13px] text-ink-2 cursor-pointer min-h-11"
            :aria-label="`${e.item.name} 明天再说`"
            @click="snooze(e.item)"
          >明天再说</button>
        </div>
      </div>
    </div>
  </section>

  <div
    v-else-if="props.showEmpty"
    class="tip mb-3.5"
  >
    今天没有待处理的物资。
  </div>

  <ConsumeSheet
    :model-value="consumeTarget !== null"
    :item="consumeTarget?.item ?? null"
    :type="consumeTarget?.type ?? 'consumed'"
    @update:model-value="consumeTarget = null"
    @confirm="confirmConsume"
  />
</template>
