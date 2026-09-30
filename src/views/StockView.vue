<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useItemsStore } from '@/stores/items';
import { useLocationsStore } from '@/stores/locations';
import { useSettingsStore } from '@/stores/settings';
import ItemCard from '@/components/ItemCard.vue';
import LocationChipBar from '@/components/LocationChipBar.vue';
import ConsumeSheet from '@/components/ConsumeSheet.vue';
import SearchField from '@/components/SearchField.vue';
import { freshnessOf, sortByFreshness, groupByFreshness, type FreshGroup } from '@/domain/freshness';
import { todayOverview } from '@/domain/stats';
import { todayStr } from '@/domain/dates';
import { lookupFood } from '@/data/dict';
import { normalizeName } from '@/data/dict/normalize';
import type { ConsumeType, Item } from '@/domain/types';
import { useToast } from '@/composables/useToast';

const router = useRouter();
const items = useItemsStore();
const locations = useLocationsStore();
const settings = useSettingsStore();
const { show } = useToast();

const today = todayStr();
const keyword = ref('');
const filterLoc = ref<string | null>(null);

/**
 * 吸顶筛选条的实测高度，作为分组头 `sticky top` 的偏移量。
 *
 * 不能写死：chip 高度受字体缩放、位置数量（换行）影响，写死 52px 时
 * 分组头会被筛选条压住只露出半截。用 ResizeObserver 跟随实际高度，
 * 再上移 1px 让两者有 1px 重叠，杜绝亚像素缝隙。
 */
const filterEl = ref<HTMLElement | null>(null);
const filterH = ref(56);
let ro: ResizeObserver | null = null;

function measureFilter() {
  const el = filterEl.value;
  if (el) filterH.value = el.getBoundingClientRect().height;
}

onMounted(() => {
  measureFilter();
  if (filterEl.value && typeof ResizeObserver !== 'undefined') {
    ro = new ResizeObserver(measureFilter);
    ro.observe(filterEl.value);
  }
});

onBeforeUnmount(() => {
  ro?.disconnect();
  ro = null;
});

/** 分组头吸顶位置：紧贴筛选条下沿（-1px 做重叠，避免发丝缝） */
const groupTop = computed(() => `${Math.max(0, Math.round(filterH.value) - 1)}px`);

/** 概览卡筛选：`FreshGroup` 走分组，'overdue' 单独筛「已过期」，null 表示不筛 */
const statusFilter = ref<FreshGroup | 'overdue' | null>(null);

const overview = computed(() => todayOverview(items.active, today, settings.settings.urgentDays));
const total = computed(() => items.active.length);

const dateLabel = computed(() => {
  const [, m, d] = today.split('-');
  return `${Number(m)} 月 ${ Number(d)} 日`;
});

function toggleStatus(next: FreshGroup | 'overdue') {
  statusFilter.value = statusFilter.value === next ? null : next;
}

function matchName(name: string, kw: string): boolean {
  if (name.toLowerCase().includes(kw)) return true;
  const f = lookupFood(name);
  if (f) {
    if (normalizeName(f.key).includes(kw)) return true;
    if (f.aliases.some((a) => normalizeName(a).includes(kw))) return true;
  }
  return false;
}

/** 过滤 + 新鲜度计算 + 排序，一次算完；附带的 `state` 供分组复用，避免二次计算 */
const rows = computed(() => {
  const kw = keyword.value.trim().toLowerCase();
  const list = items.active.filter((i) => {
    if (filterLoc.value && i.locationId !== filterLoc.value) return false;
    if (kw && !matchName(i.name, kw)) return false;
    return true;
  });
  const withF = list.map((i) => ({ item: i, f: freshnessOf(i, today, settings.settings) }));
  const sorted = sortByFreshness(withF.map((r) => ({ ...r, sortKey: r.f.sortKey, name: r.item.name })));
  return sorted.map((r) => ({ ...r, state: r.f.state }));
});

/** 切成带分组头的段落；命中概览卡筛选时只保留对应组，空组自动不出现 */
const groups = computed(() => {
  const all = rows.value;
  if (statusFilter.value === 'overdue') {
    const over = all.filter((r) => r.state === 'over');
    return over.length ? [{ group: 'urgent' as FreshGroup, label: '已过期', items: over }] : [];
  }
  const g = groupByFreshness(all);
  return statusFilter.value ? g.filter((x) => x.group === statusFilter.value) : g;
});

function openItem(id: string) {
  router.push(`/item/${id}`);
}

function openQuickAdd() {
  router.push({ path: '/stock', query: { quickadd: '1' } });
}

/** 数量显示：整数不补小数位，0.5 这类保留两位以内 */
function fmtQty(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}

/** 列表内一步完成「用掉 / 扔掉」，不必再进详情页；误点可直接在 toast 上撤销 */
async function consume(item: Item, type: ConsumeType, qty?: number) {
  const logId = await items.consume(item.id, type, qty);
  if (!logId) return;
  const verb = type === 'consumed' ? '用掉' : '扔掉';
  const used = fmtQty(qty ?? item.quantity);
  show(
    `已记录${verb}：${item.name} ${used}${item.unit}`,
    2200,
    { text: '撤销', run: () => items.undoConsume(logId) },
  );
}

/**
 * 卡片上的 ✓ / ✕：
 * - 只剩 1（或更少）时直接消耗，保持「一步 + 撤销」的手感；
 * - 数量 > 1 时先问数量（20 个鸡蛋一次只用 2 个这种）。
 */
const consumeTarget = ref<{ item: Item; type: ConsumeType } | null>(null);

function askConsume(item: Item, type: ConsumeType) {
  if (item.quantity <= 1) {
    void consume(item, type, item.quantity);
    return;
  }
  consumeTarget.value = { item, type };
}

function confirmConsume(qty: number) {
  const target = consumeTarget.value;
  consumeTarget.value = null;
  if (target) void consume(target.item, target.type, qty);
}
</script>

<template>
  <div>
    <!--
      顶部 16px 间距由本占位元素承担（TabLayout 给本页加了 .flush-top 取消 .body 的上内边距）。
      滚动容器的上内边距会让 sticky 顶边与容器顶边差一个 padding，滚动内容会从这条缝里漏出来；
      间距改由普通流内元素提供，sticky 才能严格贴到容器顶边。
    -->
    <div class="h-4" aria-hidden="true"></div>

    <div class="flex items-baseline justify-between gap-2 mb-3">
      <h1 class="text-[20px] font-semibold leading-[1.2]">库存</h1>
      <span class="text-[12px] text-ink-3 whitespace-nowrap">{{ dateLabel }} · 在库 {{ total }} 件</span>
    </div>

    <div class="grid grid-cols-3 gap-2 mb-3.5">
      <button
        type="button"
        class="border rounded-md px-2 py-2.5 text-center w-full cursor-pointer transition"
        :class="[
          statusFilter === 'urgent' ? 'bg-urgent-bg border-urgent-bg text-urgent-fg' : 'bg-card border-line text-ink-1',
          { 'ring-2 ring-primary-600': statusFilter === 'urgent' },
        ]"
        :aria-pressed="statusFilter === 'urgent'"
        @click="toggleStatus('urgent')"
      >
        <span class="block text-[20px] font-semibold leading-[1.2]">{{ overview.dueToday }}</span>
        <span class="block text-[12px] mt-0.5" :class="statusFilter === 'urgent' ? 'text-urgent-fg' : 'text-ink-3'">今日待吃</span>
      </button>
      <button
        type="button"
        class="border rounded-md px-2 py-2.5 text-center w-full cursor-pointer transition"
        :class="[
          statusFilter === 'overdue' ? 'bg-over-bg border-over-bg text-over-fg' : 'bg-card border-line text-ink-1',
          { 'ring-2 ring-primary-600': statusFilter === 'overdue' },
        ]"
        :aria-pressed="statusFilter === 'overdue'"
        @click="toggleStatus('overdue')"
      >
        <span class="block text-[20px] font-semibold leading-[1.2]">{{ overview.overdue }}</span>
        <span class="block text-[12px] mt-0.5" :class="statusFilter === 'overdue' ? 'text-over-fg' : 'text-ink-3'">已过期</span>
      </button>
      <button
        type="button"
        class="border rounded-md px-2 py-2.5 text-center w-full cursor-pointer transition bg-card border-line text-ink-1"
        :class="{ 'ring-2 ring-primary-600': statusFilter === null }"
        :aria-pressed="statusFilter === null"
        @click="statusFilter = null"
      >
        <span class="block text-[20px] font-semibold leading-[1.2]">{{ total }}</span>
        <span class="block text-[12px] mt-0.5 text-ink-3">在库</span>
      </button>
    </div>

    <div v-if="overview.dueToday > 0" class="text-[12px] text-ink-2 bg-sunken rounded-md p-2.5 mb-3.5 leading-relaxed">
      <b class="font-medium text-ink-1">今日待吃 {{ overview.dueToday }} 件</b>，点上方卡片可只看这部分。
    </div>

    <SearchField v-model="keyword" class="mb-3.5" placeholder="搜索食材（支持别名，如 番茄）" />

    <div ref="filterEl" class="sticky top-[-1px] z-20 bg-page -mx-4 px-4 pt-1 pb-2">
      <LocationChipBar v-model="filterLoc" @manage="router.push('/locations')" />
    </div>

    <div v-if="rows.length === 0" class="text-center py-12 px-6 text-[13px] text-ink-3">
      <div class="w-14 h-14 rounded-full bg-sunken flex items-center justify-center mx-auto mb-3 text-ink-3">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
          <rect x="2.5" y="3" width="19" height="5" rx="1.2" />
          <path d="M4.5 8v10.5a2.5 2.5 0 0 0 2.5 2.5h10a2.5 2.5 0 0 0 2.5-2.5V8" />
          <path d="M10 12h4" />
        </svg>
      </div>
      {{ keyword || filterLoc ? '没有符合条件的物资' : '还没有物资' }}
      <div><van-button type="primary" class="mt-3.5" @click="openQuickAdd">添加第一件物资</van-button></div>
    </div>

    <!--
      每个分组必须是独立的 <section>：sticky 元素被约束在自己的包含块内，
      分组切换时旧标题才会被新分组「顶」出去，而不是两个标题叠在同一位置。
    -->
    <section v-for="g in groups" :key="g.group" class="group">
      <div class="group-head sticky z-[19] bg-page -mx-4 px-4 py-1.5 mt-3 mb-2 flex items-center gap-2 text-[13px] font-medium text-ink-1" :style="{ top: groupTop }">
        <span>{{ g.label }}</span>
        <span class="text-[12px] text-ink-3 font-normal">{{ g.items.length }}</span>
      </div>
      <ItemCard
        v-for="r in g.items"
        :key="r.item.id"
        :item="r.item"
        :location="locations.byId(r.item.locationId)"
        @click="openItem(r.item.id)"
        @consume="askConsume"
      />
    </section>

    <ConsumeSheet
      :model-value="consumeTarget !== null"
      :item="consumeTarget?.item ?? null"
      :type="consumeTarget?.type ?? 'consumed'"
      @update:model-value="consumeTarget = null"
      @confirm="confirmConsume"
    />
  </div>
</template>
