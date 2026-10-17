<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useItemsStore } from '@/stores/items';
import { useLocationsStore } from '@/stores/locations';
import { useSettingsStore } from '@/stores/settings';
import { freshnessOf } from '@/domain/freshness';
import { formatMD, todayStr } from '@/domain/dates';
import { fmtQty } from '@/domain/quantity';
import { ENV_MAP } from '@/domain/types';
import { useToast } from '@/composables/useToast';
import type { ConsumeType } from '@/domain/types';
import type { BulkOp } from '@/domain/bulk';

const props = defineProps<{
  /** 当前筛选结果（`StockView.rows`，已过滤 + 已排序）；盘点只判这些，避免判到看不见的项 */
  rows: { item: import('@/domain/types').Item; f: ReturnType<typeof freshnessOf> }[];
}>();

const emit = defineEmits<{ (e: 'exit'): void }>();

const items = useItemsStore();
const locations = useLocationsStore();
const settings = useSettingsStore();
const { show } = useToast();

const today = todayStr();

/**
 * 盘点队列：进入时对当前筛选结果拍一个快照。
 *
 * ⚠️ 必须是**快照**而不是实时读 `props.rows`：每判定一张就会消耗掉一件，
 * `items.active` 随之缩短，若直接跟着它走，列表会一边判定一边往前缩，
 * 用户会看到「刚判过的又冒出来」。中途退出**不保留进度**（见下方 `exit`）。
 */
const queue = ref(props.rows.map((r) => r.item.id));
const cursor = ref(0);

/** 本次盘点累计的撤销快照；所有判定共用一个，整批可撤 */
const ops = ref<BulkOp[]>([]);
/** 判定结果计数，用于收尾总结 */
const result = ref({ consumed: 0, wasted: 0 });

const total = computed(() => queue.value.length);
const current = computed(() => {
  const id = queue.value[cursor.value];
  return id ? items.byId(id) : undefined;
});
const currentFresh = computed(() =>
  current.value ? freshnessOf(current.value, today, settings.settings) : null,
);
const currentLoc = computed(() => (current.value ? locations.byId(current.value.locationId) : undefined));

/** 筛选结果变化（换了位置/关键词）就重置队列，否则进度会指向别的集合 */
watch(
  () => props.rows,
  (list) => {
    queue.value = list.map((r) => r.item.id);
    cursor.value = 0;
    ops.value = [];
    result.value = { consumed: 0, wasted: 0 };
  },
);

/**
 * 「还在」：只把这一张标记为已核对，**不写任何日志**。
 *
 * 盘点要的是「把冰箱里的东西对一遍」，绝大多数物品的结果都是「还在」。
 * 让它走 `consume` 会平白造出一堆「消耗 1 个」的日志，把统计彻底污染。
 */
function markPresent() {
  cursor.value++;
}

/**
 * 「用掉了」/「扔掉了」：整件消耗，写日志，计入浪费（后者）。
 *
 * 数量 > 1 也**全量消耗**，不弹数量选择 —— 盘点追求的是「十秒过完整个冰箱」，
 * 需要部分数量的人退出盘点用普通消耗即可（判定本身是幂等的，不怕多点一次）。
 */
async function judge(type: ConsumeType) {
  const it = current.value;
  if (!it) return;
  const op = await items.consumeGroup([it.id], type);
  if (op) {
    ops.value = [...ops.value, op];
    result.value = {
      ...result.value,
      [type === 'consumed' ? 'consumed' : 'wasted']: result.value[type === 'consumed' ? 'consumed' : 'wasted'] + 1,
    };
  }
  cursor.value++;
}

/** 汇总本次盘点的所有撤销快照，交给 toast 的「撤销」一次性回滚 */
function mergedOp(): BulkOp | null {
  if (!ops.value.length) return null;
  const seen = new Set<string>();
  const map = new Map<string, BulkOp['items'][number]>();
  const logIds: string[] = [];
  for (const op of ops.value) {
    for (const it of op.items) if (!seen.has(it.id)) { seen.add(it.id); map.set(it.id, it); }
    logIds.push(...op.logIds);
  }
  return { id: ops.value[0]!.id, kind: 'consume', items: [...map.values()], logIds, createdAt: Date.now() };
}

const finished = computed(() => cursor.value >= total.value);

/**
 * 收尾并退出。
 *
 * 中途退出**不保留进度**（`queue` / `cursor` 是纯内存 ref，没有落盘），
 * 代价是重来一遍；换来的是不用处理「三天前盘了一半的进度到底还算不算」这个corner case。
 */
function finish() {
  const op = mergedOp();
  const gone = result.value.consumed + result.value.wasted;
  const checked = cursor.value;
  if (op && gone > 0) {
    show(`核对 ${checked} 件，${gone} 件已不在（用掉 ${result.value.consumed} · 扔掉 ${result.value.wasted}）`, 4000, {
      text: '撤销',
      run: () => items.undoBulk(op),
    });
  } else {
    show(`核对 ${checked} 件，东西都在`, 2200);
  }
  emit('exit');
}
</script>

<template>
  <div>
    <!--
      进度条：写「3 / 12」而不只是百分比。盘点是个会走神的长流程，
      用户需要随时知道「还剩几件」才能决定要不要先放着。
    -->
    <div class="card px-3 py-2.5 mb-3.5">
      <div class="flex items-baseline justify-between gap-2 mb-2">
        <span class="text-[13px] text-ink-1">
          已核对 <b class="font-medium">{{ Math.min(cursor, total) }}</b> / {{ total }} 件
        </span>
        <button type="button" class="text-[12px] text-ink-3 cursor-pointer" @click="finish">
          {{ finished ? '完成' : '结束盘点' }}
        </button>
      </div>
      <div class="h-1.5 rounded bg-sunken overflow-hidden">
        <i
          class="block h-full rounded bg-primary-600 transition-[width] duration-200"
          :style="{ width: total ? ((Math.min(cursor, total) / total) * 100).toFixed(0) + '%' : '0%' }"
        ></i>
      </div>
      <p class="text-[12px] text-ink-3 mt-2 leading-relaxed">
        逐张核对冰箱里的东西。点「还在」只做标记，不写日志；确认不见了再选用掉或扔掉。
      </p>
    </div>

    <div v-if="!current" class="text-center py-12 px-6 text-[13px] text-ink-3">
      {{ total === 0 ? '当前筛选下没有可盘点的物资' : '全部核对完毕' }}
      <div><van-button type="primary" class="mt-3.5" @click="finish">完成</van-button></div>
    </div>

    <template v-else>
      <!--
        一屏一张卡 + 三个大按钮：盘点的动作只有三种，且都常按。
        按钮做高等分（不是图标），因为在「我到底还剩几件」的压力下，
        读字比认符号快得多。
      -->
      <div class="card p-3.5 mb-3 shadow-card">
        <div class="flex items-start gap-3">
          <span class="w-11 h-11 rounded-md flex-none flex items-center justify-center text-[16px] font-medium text-primary-700 bg-primary-50">
            {{ current.icon || current.name.slice(0, 1) }}
          </span>
          <div class="flex-1 min-w-0">
            <div class="text-[16px] font-medium text-ink-1 truncate">{{ current.name }}</div>
            <div class="flex items-center gap-1.5 text-[12px] text-ink-3 mt-1 flex-wrap">
              <span>{{ fmtQty(current.quantity) }} {{ current.unit }}</span>
              <span v-if="currentLoc" class="inline-flex items-center gap-1 text-ink-2 bg-sunken px-1.5 py-0.5 rounded">
                <i class="w-1.5 h-1.5 rounded-full block" :style="{ background: ENV_MAP[currentLoc.env].color }"></i>{{ currentLoc.name }}
              </span>
            </div>
            <!-- 盘点时必须显示到期日：要扔的是不是快过期的那些，全靠这一行判断 -->
            <div class="mt-1.5">
              <span
                v-if="currentFresh"
                class="text-[12px] px-2 py-0.5 rounded-full"
                :class="{
                  'bg-over-bg text-over-fg': currentFresh.state === 'over',
                  'bg-urgent-bg text-urgent-fg': currentFresh.state === 'urgent',
                  'bg-soon-bg text-soon-fg': currentFresh.state === 'soon',
                  'bg-fresh-bg text-fresh-fg': currentFresh.state === 'fresh',
                  'bg-sunken text-ink-2': currentFresh.state === 'warn' || currentFresh.state === 'none',
                }"
              >{{ current.expireAt ? formatMD(current.expireAt) + ' 到期 · ' : '' }}{{ currentFresh.label }}</span>
            </div>
          </div>
        </div>
      </div>

      <div class="flex gap-2">
        <button
          type="button"
          class="flex-1 inline-flex items-center justify-center gap-1 bg-card border border-line-strong rounded-md text-[13px] text-ink-1 cursor-pointer min-h-12"
          :aria-label="`${current.name} 还在`"
          @click="markPresent"
        >还在</button>
        <button
          type="button"
          class="flex-1 inline-flex items-center justify-center gap-1 bg-card border border-line-strong rounded-md text-[13px] text-primary-700 cursor-pointer min-h-12"
          :aria-label="`${current.name} 用掉了`"
          @click="judge('consumed')"
        >用掉了</button>
        <button
          type="button"
          class="flex-1 inline-flex items-center justify-center gap-1 bg-card border border-danger rounded-md text-[13px] text-danger cursor-pointer min-h-12"
          :aria-label="`${current.name} 扔掉了`"
          @click="judge('wasted')"
        >扔掉了</button>
      </div>
    </template>
  </div>
</template>
