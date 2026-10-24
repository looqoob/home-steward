<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import SearchField from '@/components/SearchField.vue';
import Pill from '@/components/Pill.vue';
import PillGroup from '@/components/PillGroup.vue';
import EmptyState from '@/components/EmptyState.vue';
import StatCard from '@/components/StatCard.vue';
import { useItemsStore } from '@/stores/items';
import type { ConsumeLog, ConsumeType } from '@/domain/types';
import { fromEpoch, monthKey, todayStr, toDateStr } from '@/domain/dates';
import { normalizePrice } from '@/domain/price';
import { useStickyFilterOffset } from '@/composables/useStickyFilterOffset';

const router = useRouter();
const route = useRoute();
const items = useItemsStore();

type RangeKey = 'all' | 'today' | '7d' | 'month' | 'year';
type CatKey = 'all' | ConsumeType;

const ranges: { key: RangeKey; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'today', label: '今天' },
  { key: '7d', label: '近7天' },
  { key: 'month', label: '本月' },
  { key: 'year', label: '今年' },
];
const cats: { key: CatKey; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'consumed', label: '用掉' },
  { key: 'wasted', label: '扔掉' },
];

const range = ref<RangeKey>('all');
const cat = ref<CatKey>('all');
/**
 * 关键词初值取自路由 `?name=`。
 *
 * 统计页的「最常浪费 Top 5」点进来就是靠它定位到某个名称 ——
 * 与其新造一个 `/consume-log?name=x` 的路由分支，不如复用已有的搜索框，
 * 用户进来后还能自己改、能看见自己被筛了什么。
 */
const kw = ref(typeof route.query.name === 'string' ? route.query.name : '');

const pad2 = (n: number) => String(n).padStart(2, '0');

/** 相对日标签：今天 / 昨天 / MM-DD（单条时间用） */
function relDay(at: number): string {
  const day = fromEpoch(at);
  const today = todayStr();
  if (day === today) return '今天';
  const y = new Date();
  y.setDate(y.getDate() - 1);
  if (day === toDateStr(y)) return '昨天';
  return day.slice(5);
}

/** 行内时间：今天 14:30 / 昨天 09:12 / 09-28 19:05 */
function fmtAt(at: number): string {
  const d = new Date(at);
  return `${relDay(at)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** 分组标题：今天 / 昨天 / 具体日期 */
function groupTitle(day: string): string {
  const today = todayStr();
  if (day === today) return '今天';
  const y = new Date();
  y.setDate(y.getDate() - 1);
  if (day === toDateStr(y)) return '昨天';
  return day;
}

function inRange(at: number, r: RangeKey, now: number): boolean {
  if (r === 'all') return true;
  const day = fromEpoch(at);
  const today = todayStr(now);
  if (r === 'today') return day === today;
  if (r === '7d') return at >= now - 7 * 86400000;
  if (r === 'month') return monthKey(day) === monthKey(today);
  if (r === 'year') return day.slice(0, 4) === today.slice(0, 4);
  return true;
}

/**
 * 金额 / 单价格式化：未填价格统一以「-」表示。
 *
 * 走 `normalizePrice` 而不是只判 `== null`：明细页是**唯一**直接把库里的金额喂给
 * `.toFixed()` 的地方，值若是脏的（旧备份里的字符串、负数）会直接抛 TypeError 白屏。
 */
function money(n: number | null | undefined): string {
  const p = normalizePrice(n);
  return p === null ? '-' : '¥' + p.toFixed(2);
}

const filtered = computed<ConsumeLog[]>(() => {
  const now = Date.now();
  const k = kw.value.trim();
  return items.logs
    .filter((l) => !l.deletedAt)
    .filter((l) => cat.value === 'all' || l.type === cat.value)
    .filter((l) => inRange(l.at, range.value, now))
    .filter((l) => !k || l.name.includes(k))
    .slice()
    .sort((a, b) => b.at - a.at);
});

/** 按天分组（filtered 已倒序，Map 插入顺序即倒序的天） */
const groups = computed(() => {
  const map = new Map<string, ConsumeLog[]>();
  for (const l of filtered.value) {
    const day = fromEpoch(l.at);
    if (!map.has(day)) map.set(day, []);
    map.get(day)!.push(l);
  }
  return [...map.entries()].map(([day, list]) => ({ day, list }));
});

/**
 * 合计金额 / 浪费金额。
 *
 * 走 `normalizePrice` 而不是 `l.price || 0`：后者把「真的免费（0）」和「没填价（null）」
 * 混为一谈，且对脏值（旧备份里的字符串）不做防护 —— `0 + "12.5"` 会触发字符串拼接
 * 让整条 reduce 变成 `"012.5…"`。`normalizePrice` 把脏值一律归 `null`，`?? 0` 再落回 0。
 */
const totalAmount = computed(() =>
  Math.round(filtered.value.reduce((s, l) => s + (normalizePrice(l.price) ?? 0), 0) * 100) / 100,
);
const totalCount = computed(() => filtered.value.length);
const wastedAmount = computed(() =>
  Math.round(
    filtered.value.filter((l) => l.type === 'wasted').reduce((s, l) => s + (normalizePrice(l.price) ?? 0), 0) * 100,
  ) / 100,
);

/** 吸顶头部块（概览卡 + 搜索 + 筛选）的实测高度 → 按天分组头偏移 */
const { filterEl, filterH } = useStickyFilterOffset();
const groupTop = computed(() => `${Math.max(0, Math.round(filterH.value) - 1)}px`);
</script>

<template>
  <div>
    <!--
      顶栏不在这里渲染：本页挂在 TabLayout 下，标题栏由外壳根据 `meta.header` 渲染在滚动容器外面，
      才能贴死顶部、不随内容滚动，并像底部 Tab 一样占满整宽（页面内渲染会被容器的 px-4 缩进）。
    -->

    <!--
      ★ 吸顶头部块（v1.1 F7）：顶部留白 + 概览卡 + 搜索 + 筛选整体钉在顶栏下，
      只有按天分组的记录列表滚动。占位元素必须在块**内部**（否则吸顶后顶栏下漏缝），
      详见 src/styles/README.md「吸顶层约定」。
    -->
    <div ref="filterEl" class="sticky top-[-1px] z-20 bg-page -mx-4 px-4 pb-2">
      <div class="h-5" aria-hidden="true"></div>

      <div v-if="totalCount > 0" class="grid grid-cols-3 gap-2 mb-3.5">
        <StatCard :value="totalCount" label="笔数" />
        <StatCard :value="money(totalAmount)" label="合计金额" />
        <StatCard
          :value="money(wastedAmount)"
          label="扔掉金额"
          :tone="wastedAmount > 0 ? 'danger' : 'neutral'"
        />
      </div>

      <SearchField v-model="kw" class="mb-2" placeholder="搜索名称" />
      <PillGroup role="group" aria-label="按日期筛选">
        <Pill
          v-for="r in ranges"
          :key="r.key"
          :selected="range === r.key"
          @click="range = r.key"
        >{{ r.label }}</Pill>
      </PillGroup>
      <div class="flex gap-1.5 bg-sunken p-1 rounded-full mt-2">
        <button
          v-for="c in cats"
          :key="c.key"
          type="button"
          class="flex-1 border-0 bg-transparent text-[13px] text-ink-2 py-1.5 rounded-full cursor-pointer"
          :class="{ 'bg-card text-primary-700 font-medium shadow-card': cat === c.key }"
          :aria-pressed="cat === c.key"
          @click="cat = c.key"
        >{{ c.label }}</button>
      </div>
    </div>

    <EmptyState v-if="groups.length === 0" text="没有符合筛选条件的消耗记录">
      <template #icon>
        <svg class="icon icon-ill" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="9" y1="13" x2="15" y2="13" />
          <line x1="9" y1="17" x2="13" y2="17" />
        </svg>
      </template>
      <template #action>
        <van-button @click="router.push('/stock')">去添加物资</van-button>
      </template>
    </EmptyState>

    <template v-for="g in groups" :key="g.day">
      <section class="group">
        <div class="sticky z-[19] bg-page -mx-4 px-4 py-1.5 mt-3 mb-2 flex items-center gap-2 text-[13px] font-medium text-ink-1" :style="{ top: groupTop }">
          <span>{{ groupTitle(g.day) }}</span>
          <span class="text-[12px] text-ink-3 font-normal">{{ g.list.length }}</span>
        </div>
        <article
          v-for="l in g.list"
          :key="l.id"
          class="bg-card border border-line border-l-[3px] rounded-md p-3 mb-2.5 shadow-card"
          :class="l.type === 'wasted' ? 'border-l-danger' : 'border-l-primary-600'"
        >
          <div class="flex justify-between items-baseline gap-3">
            <div class="text-[15px] font-semibold text-ink-1 min-w-0 truncate">
              <span
                class="text-[12px] leading-none px-1.5 py-0.5 rounded-full font-medium mr-1.5 align-middle"
                :class="l.type === 'consumed' ? 'text-primary-600 bg-primary-50' : 'text-danger bg-danger/10'"
              >{{ l.type === 'consumed' ? '用掉' : '扔掉' }}</span>
              {{ l.name }}
            </div>
            <div class="text-[16px] font-bold whitespace-nowrap" :class="{ 'text-danger': l.type === 'wasted' }">{{ money(l.price) }}</div>
          </div>
          <div class="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-ink-3">
            <span>{{ fmtAt(l.at) }}</span>
            <span>{{ l.quantity }}{{ l.unit }}</span>
            <span>单价 {{ money(l.unitPrice) }}</span>
          </div>
          <div v-if="l.note" class="mt-2 text-[12px] text-ink-2 bg-sunken rounded-md p-1.5 break-all">备注：{{ l.note }}</div>
        </article>
      </section>
    </template>

    <div v-if="groups.length > 0" class="sticky bottom-0 bg-card border-t border-line rounded-t-md px-3.5 py-3 pb-[calc(12px+env(safe-area-inset-bottom,0px))] mt-2 flex justify-between items-center shadow-[0_-2px_8px_rgba(0,0,0,0.04)]" role="status" aria-live="polite">
      <span class="text-[13px] text-ink-2">合计（{{ totalCount }} 笔）</span>
      <span class="text-[18px] font-bold text-ink-1">{{ money(totalAmount) }}</span>
    </div>
  </div>
</template>
