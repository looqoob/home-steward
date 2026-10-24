<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useItemsStore } from '@/stores/items';
import { useLocationsStore } from '@/stores/locations';
import { useSettingsStore } from '@/stores/settings';
import ItemGroupCard from '@/components/ItemGroupCard.vue';
import LocationChipBar from '@/components/LocationChipBar.vue';
import IconText from '@/components/IconText.vue';
import PageHeader from '@/components/PageHeader.vue';
import EmptyState from '@/components/EmptyState.vue';
import StatCard from '@/components/StatCard.vue';
import ConsumeSheet from '@/components/ConsumeSheet.vue';
import GroupConsumeSheet from '@/components/GroupConsumeSheet.vue';
import StocktakePanel from '@/components/StocktakePanel.vue';
import SearchField from '@/components/SearchField.vue';
import TodayTodo from '@/components/TodayTodo.vue';
import BulkActionBar from '@/components/BulkActionBar.vue';
import LocationPickerSheet from '@/components/LocationPickerSheet.vue';
import ConfirmSheet from '@/components/ConfirmSheet.vue';
import BottomSheet from '@/components/BottomSheet.vue';
import FormField from '@/components/FormField.vue';
import { freshnessOf, sortByFreshness, groupByFreshness, type FreshGroup } from '@/domain/freshness';
import { groupByTimeline } from '@/domain/timeline';
import { foldItems, type ItemGroup } from '@/domain/grouping';
import { buildTodayTodo } from '@/domain/todo';
import { fmtQty } from '@/domain/quantity';
import { priceFromInput, normalizePrice } from '@/domain/price';
import { lookupFood } from '@/data/dict';
import { foodKeyOf } from '@/data/dict';
import { normalizeName } from '@/data/dict/normalize';
import type { ConsumeType, Item } from '@/domain/types';
import type { BulkOp } from '@/domain/bulk';
import { useToast } from '@/composables/useToast';
import { useToday } from '@/composables/useNow';

const router = useRouter();
const route = useRoute();
const items = useItemsStore();
const locations = useLocationsStore();
const settings = useSettingsStore();
const { show } = useToast();

const today = useToday();
const keyword = ref('');
const filterLoc = ref<string | null>(null);

/** 概览卡筛选：`FreshGroup` 走分组，'overdue' 单独筛「已过期」，null 表示不筛 */
const statusFilter = ref<FreshGroup | 'overdue' | null>(null);

/**
 * 列表展示方式：**改从设置读**（`Settings.stockViewMode`），不再走路由 query。
 *
 * 原先是 `?view=timeline` + 页面上的一组 Tab。Tab 的问题在于它把「我习惯怎么看」
 * 这个长期偏好，和「这一次想怎么筛」混在了同一个地方 —— 每次想换视图都得在页面上
 * 腾出一行常驻按钮。改到设置里之后，库存页只保留跟当前筛选相关的控件，
 * 视图偏好一次配好长期生效。
 *
 * ⚠️ 值由 `stores/settings.normalizeSettings` 保证合法（旧数据回落 `'group'`），
 * 所以这里可以直接比较，不需要再兜底。
 */
const viewMode = computed(() => settings.settings.stockViewMode);

/**
 * 「今日待吃」概览。
 *
 * ⚠️ 必须与 `TodayTodo` 用**同一个** `buildTodayTodo`：
 * 概览卡显示 3 而待办列表只有 2 条（因为有 items 被「明天再说」延后了），
 * 用户点进去会觉得数字在骗人。
 */
const todo = computed(() => buildTodayTodo(items.list, today.value, settings.settings));
const total = computed(() => items.active.length);

/**
 * 「已过期」从 `todo` 里数，而不是从筛选后的 `rows` 里数（REV-18）。
 *
 * 三个概览数字必须是**同一套口径**（全量、排除「明天再说」）：
 * 「在库 20 / 已过期 0」配一个红色列表，或切了位置筛选后「已过期」跟着跳，
 * 用户都会得出「数字是瞎编的」的结论。此前它读 `rows`（受搜索/位置筛选影响、
 * 也不排除延后项），与旁边的 `total`（全量）、`todo.length`（全量）三处口径各不相同。
 */
const overdueCount = computed(() => todo.value.filter((t) => t.state === 'over').length);

const dateLabel = computed(() => {
  const [, m, d] = today.value.split('-');
  return `${Number(m)} 月 ${ Number(d)} 日`;
});

function toggleStatus(next: FreshGroup | 'overdue') {
  statusFilter.value = statusFilter.value === next ? null : next;
}

function matchName(name: string, kw: string): boolean {
  // 先按归一名比（全角/括号/空白/大小写差异不再挡搜索），再走字典别名（西红柿 ↔ 番茄）
  if (normalizeName(name).includes(kw)) return true;
  const f = lookupFood(name);
  if (f) {
    if (normalizeName(f.key).includes(kw)) return true;
    if (f.aliases.some((a) => normalizeName(a).includes(kw))) return true;
  }
  return false;
}

/** 过滤 + 新鲜度计算 + 排序，一次算完；附带的 `state` 供分组复用，避免二次计算 */
const rows = computed(() => {
  const kw = normalizeName(keyword.value);
  const list = items.active.filter((i) => {
    if (filterLoc.value && i.locationId !== filterLoc.value) return false;
    if (kw && !matchName(i.name, kw)) return false;
    return true;
  });
  const withF = list.map((i) => ({ item: i, f: freshnessOf(i, today.value, settings.settings) }));
  const sorted = sortByFreshness(withF.map((r) => ({ ...r, sortKey: r.f.sortKey, name: r.item.name })));
  return sorted.map((r) => ({ ...r, state: r.f.state }));
});

/**
 * 「同名折叠」后的分组（V3-06）。
 *
 * 折叠键 = 位置 + 名称（字典别名视为同名），所以折叠**必须在筛选之后**做：
 * 位置筛选到一个位置时，那几份自然落进同一组。
 *
 * 传 `foodKeyOf` 让「番茄」与「西红柿」折叠成一张卡；不传就只有字面同名才折叠。
 */
const itemGroups = computed<ItemGroup[]>(() => foldItems(rows.value.map((r) => r.item), foodKeyOf));

/**
 * 分组 → 该组在列表里的位置条目。
 *
 * ⚠️ **折叠必须在分段之前**。如果先分段再折叠，一组里「已过期」那份在紧急段、
 * 「还剩 20 天」那份在新鲜段，同一盒牛奶会在两个地方各出现一次 —— 这是最不能接受的错。
 *
 * 分段依据取 `lead`（组内最早到期那份）的状态：既然 lead 最早，
 * 「组里有没有一件已过期」等价于「lead 是否已过期」，两个口径天然一致。
 *
 * 段内计数用**份数**而非组数：概览卡的「今日待吃 3」是按份算的，
 * 组头写 2 会和上面的数字打架。
 */
const foldedRows = computed(() => {
  const out = itemGroups.value.map((g) => {
    const f = freshnessOf(g.lead, today.value, settings.settings);
    // `remainDays` 平铺出来：`groupByTimeline` 需要它来判桶，
    // 而 `groupByFreshness` 只看 `state` —— 两者共用同一份对象，不用各算一次。
    return { group: g, f, state: f.state, remainDays: f.remainDays, sortKey: f.sortKey, name: g.name };
  });
  return sortByFreshness(out);
});

/** 物品 id → 它所属的折叠组。单份组也在表里，模板可以统一走一条路径。 */
const groupByItemId = computed(() => {
  const m = new Map<string, ItemGroup>();
  for (const g of itemGroups.value) for (const it of g.members) m.set(it.id, g);
  return m;
});

function groupOfItem(id: string): ItemGroup | undefined {
  return groupByItemId.value.get(id);
}

/** 概览卡 / 视图切换后的段落。分组与时间轴共用同一份 `foldedRows`，只是切法不同。 */
const sections = computed(() => {
  let list = foldedRows.value;
  if (statusFilter.value === 'overdue') {
    list = list.filter((r) => r.f.state === 'over');
  } else if (statusFilter.value) {
    const g = groupOfState(statusFilter.value);
    list = list.filter((r) => g(r.f.state));
  }
  if (!list.length) return [];

  // 不分组：整段平铺。`label` 为空串，模板据此不渲染段头（不必再开一条渲染路径）
  if (viewMode.value === 'flat') {
    return [{ key: 'flat', label: '', rows: list, count: list.reduce((s, r) => s + r.group.members.length, 0) }];
  }

  const bundles =
    viewMode.value === 'timeline'
      ? groupByTimeline(list).map((b) => ({ key: `t-${b.bucket}`, label: b.label, rows: b.items }))
      : statusFilter.value === 'overdue'
        ? [{ key: 'over', label: '已过期', rows: list }]
        : groupByFreshness(list).map((g) => ({ key: g.group, label: g.label, rows: g.items }));

  return bundles.map((b) => ({
    key: b.key,
    label: b.label,
    rows: b.rows,
    // 段头计数按**份数**，与概览卡口径一致
    count: b.rows.reduce((s, r) => s + r.group.members.length, 0),
  }));
});

/** `FreshGroup` → 六态过滤器（与 `domain/freshness.groupOf` 同一套映射，视图内不重写） */
function groupOfState(g: FreshGroup) {
  if (g === 'urgent') return (s: string) => s === 'over' || s === 'urgent';
  if (g === 'soon') return (s: string) => s === 'soon';
  if (g === 'fresh') return (s: string) => s === 'fresh';
  return (s: string) => s === 'warn' || s === 'none';
}

/* ==================== 窗口化渲染（v1.1 F10-6） ==================== */

/**
 * 长列表只渲染「首屏 + 滚过的地方」，不一次渲染全部组卡。
 *
 * 几百件物资时掉帧的主因是 DOM 数量（每张组卡含徽标 / 进度条 / 展开区），
 * 而不是 `foldItems` 的排序本身（几百量级的 O(n log n) 是毫秒级）。
 *
 * 采用**增量窗口**而不是回收式虚拟滚动：组卡高度可变（展开 / 两行名 / 备注标签）、
 * 分组头 sticky 依赖各自的 `<section>` 包含块（回收式要在单容器里做偏移计算，
 * F8/F9 刚收口的滚动体系会被大面积重写）。窗口化追加零偏移计算、零滚动跳动，
 * 代价是滚过的卡片不回收——在「几百件」的目标规模下 DOM 上界完全可接受。
 *
 * - 段头数量有限（≤10），全部照常渲染，只有组卡参与窗口化；
 * - 盘点面板（StocktakePanel）不参与：盘点本来就要逐张判定，截断反而碍事；
 * - 多选「全选」仍作用于**全部**筛选结果（`rows`），与渲染窗口无关。
 */
const WINDOW_INITIAL = 40;
const WINDOW_BATCH = 30;
/** 触底提前量：距底部 600px（约两屏）就开始追加，用户几乎感知不到加载 */
const WINDOW_TRIGGER = 600;

const visibleCount = ref(WINDOW_INITIAL);

/** 当前筛选下的组卡总数（窗口化的分母，也用于重置判断） */
const totalGroups = computed(() => sections.value.reduce((s, sec) => s + sec.rows.length, 0));

/** 按段分配可见配额：从第一段开始消耗 `visibleCount`，取完为止；被截空的段整段不渲染 */
const visibleSections = computed(() => {
  let remain = visibleCount.value;
  const out: { key: string; label: string; count: number; rows: typeof sections.value[number]['rows'] }[] = [];
  for (const sec of sections.value) {
    if (remain <= 0) break;
    const take = Math.min(sec.rows.length, remain);
    remain -= take;
    if (take < sec.rows.length) {
      out.push({ ...sec, rows: sec.rows.slice(0, take) });
    } else {
      out.push(sec);
    }
  }
  return out;
});

/**
 * 筛选 / 搜索 / 视图变化后回到初始窗口：新结果集的排序完全不同，
 * 保留大的 `visibleCount` 会让首屏一次性渲染几百张卡，失去窗口化意义。
 * 数据增删（`totalGroups` 变化）**不**重置：滚动位置附近的窗口继续有效。
 */
watch([keyword, filterLoc, statusFilter, viewMode], () => {
  visibleCount.value = WINDOW_INITIAL;
});

const listEl = ref<HTMLElement | null>(null);
let scrollRafPending = false;

/** rAF 节流的触底追加：scroll 事件每帧最多处理一次 */
function onListScroll() {
  if (scrollRafPending) return;
  scrollRafPending = true;
  requestAnimationFrame(() => {
    scrollRafPending = false;
    const el = listEl.value;
    if (!el) return;
    if (visibleCount.value >= totalGroups.value) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - WINDOW_TRIGGER) {
      visibleCount.value += WINDOW_BATCH;
    }
  });
}

function openItem(id: string) {
  router.push(`/item/${id}`);
}

function openQuickAdd() {
  router.push({ path: '/stock', query: { quickadd: '1' } });
}

/**
 * 进设置。用 `push` 而不是 `replace`：改完设置要靠返回键回到库存页，
 * 替换掉当前记录就没得回了。列表展示方式在「设置 → 库存设置」里。
 */
function openSettings() {
  router.push('/settings');
}

/* ==================== 消耗 ==================== */

/** 单条记录的消耗（折叠组展开后的行内按钮走这里） */
async function consume(item: Item, type: ConsumeType, qty?: number) {
  const logId = await items.consume(item.id, type, qty);
  if (!logId) return;
  const verb = type === 'consumed' ? '用掉' : '扔掉';
  const used = fmtQty(qty ?? item.quantity);
  show(`已记录${verb}：${item.name} ${used}${item.unit}`, 2200, {
    text: '撤销',
    run: () => items.undoConsume(logId),
  });
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

/* ---------- 折叠组的消耗（V3-06）：弹层里选份，确认后按 FEFO 扣 ---------- */

const groupTarget = ref<{ group: ItemGroup; type: ConsumeType } | null>(null);

/**
 * 组卡右上角的 ✓ / ✕。
 *
 * 单份组走单条路径（一步到位，不多弹一层）；多份组才弹层选份。
 * 弹层里默认选中 FEFO 首份，用户不选就是「先吃快过期的」——这正是我们要的默认。
 */
function askGroupConsume(group: ItemGroup, type: ConsumeType) {
  if (group.members.length === 1) {
    const only = group.lead;
    if (only.quantity <= 1) {
      void consume(only, type, only.quantity);
    } else {
      groupTarget.value = { group, type };
    }
    return;
  }
  groupTarget.value = { group, type };
}

async function confirmGroupConsume(targets: Item[], qty: number) {
  const t = groupTarget.value;
  groupTarget.value = null;
  if (!t) return;
  const verb = t.type === 'consumed' ? '用掉' : '扔掉';
  if (targets.length === 1) {
    const only = targets[0] as Item;
    const op = await items.consumeGroup([only.id], t.type, qty);
    if (!op) return;
    show(
      `已记录${verb}：${only.name} ${fmtQty(qty)}${only.unit}`,
      2200,
      { text: '撤销', run: () => items.undoBulk(op) },
    );
    return;
  }
  // 一次确认扣了多份：走整批撤销，避免用户要点 N 次撤销
  const op = await items.consumeGroup(targets.map((i) => i.id), t.type, qty);
  if (!op) return;
  show(`已记录${verb} ${targets.length} 份：${t.group.name}`, 2200, {
    text: '撤销',
    run: () => items.undoBulk(op),
  });
}

/* ==================== 多选 / 批量操作 ==================== */

/**
 * 多选态放在路由 query 上（`?select=1`）而不是纯本地 `ref`：
 * 外壳 `TabLayout` 需要知道「隐藏 FAB、给底部多留 120px」，那是另一个组件。
 * 走 query 让两边看同一个真值，不用 provide/prop 把外壳和页面耦合起来。
 */
const selectMode = computed(() => route.query.select === '1');
/** 选中的物品 id 集合（仅本页需要，不进 query） */
const selected = ref<Set<string>>(new Set());

function setSelectMode(on: boolean) {
  const q = { ...route.query };
  if (on) q.select = '1';
  else delete q.select;
  router.replace({ path: '/stock', query: q });
}

/** 筛选/搜索变化后，若选中的物品已不在结果里就清掉，避免对「看不见的项」执行批量操作 */
watch([rows, statusFilter], () => {
  if (!selected.value.size) return;
  const visible = new Set(rows.value.map((r) => r.item.id));
  const next = new Set([...selected.value].filter((id) => visible.has(id)));
  if (next.size !== selected.value.size) selected.value = next;
});

function toggleSelect(item: Item) {
  const next = new Set(selected.value);
  if (next.has(item.id)) next.delete(item.id);
  else next.add(item.id);
  selected.value = next;
  if (!next.size) setSelectMode(false);
}

/**
 * 折叠组的多选：**选中/取消该组的全部份**。
 *
 * 逐份勾选在折叠态下没有入口（份都收在卡里），而「只勾其中一份」这个诉求
 * 在批量场景里几乎不出现（批量是清空操作，本来就是整件处理）。
 */
function toggleSelectGroup(group: ItemGroup) {
  const next = new Set(selected.value);
  const allIn = group.members.every((m) => next.has(m.id));
  for (const m of group.members) {
    if (allIn) next.delete(m.id);
    else next.add(m.id);
  }
  selected.value = next;
  if (!next.size) setSelectMode(false);
}

function enterSelect(item?: Item) {
  if (item) selected.value = new Set([item.id]);
  setSelectMode(true);
}

/** 长按组卡：整组进多选并全选（与点击复选框的行为一致，少一次「再点一下全选」） */
function enterSelectGroup(group: ItemGroup) {
  selected.value = new Set(group.members.map((m) => m.id));
  setSelectMode(true);
}

function exitSelect() {
  setSelectMode(false);
  selected.value = new Set();
}

function selectAll() {
  selected.value =
    selected.value.size >= rows.value.length
      ? new Set()
      : new Set(rows.value.map((r) => r.item.id));
}

const selectedNames = computed(() =>
  rows.value.filter((r) => selected.value.has(r.item.id)).map((r) => r.item.name),
);

/** 批量执行后的统一收尾：清空选择、退出多选，并给出**整批**撤销 */
async function afterBulk(op: BulkOp | null, verb: string) {
  if (!op) {
    show('没有可操作的物资');
    return;
  }
  exitSelect();
  show(`${verb} ${op.items.length} 件`, 2200, { text: '撤销', run: () => items.undoBulk(op) });
}

async function bulkConsume(type: ConsumeType) {
  const op = await items.bulkConsume([...selected.value], type);
  await afterBulk(op, type === 'consumed' ? '已用掉' : '已扔掉');
}

const moveSheet = ref(false);

async function bulkMove(locationId: string) {
  const op = await items.bulkMoveTo([...selected.value], locationId);
  const loc = locations.byId(locationId);
  await afterBulk(op, `已移到${loc?.name ?? '新位置'}`);
}

const confirmBulkRemove = ref(false);

async function bulkRemove() {
  const op = await items.bulkRemove([...selected.value]);
  await afterBulk(op, '已删除');
}

/**
 * 批量改价：把选中的物品单价改成同一个值。
 *
 * 与其他批量操作一样走 `pickActive` 快照 + `remember(BulkOp)`：
 * - `null` = 把这批物品的价清空（"没填价"），不是改成 0；
 * - `0` = 真的免费（保留 null / 0 的语义边界）。
 *
 * 因为一次只能填一个价，这里只支持"统一改价"——选中几件都同价，
 * 不能在批量面板里逐条改。后者更合适在物品详情里做。
 */
const priceSheet = ref(false);
const batchPrice = ref<number | null>(null);

function openPriceSheet() {
  // 打开即重置：上一次批量改价的残留值不能带到这一次（不同批次的价差极大）
  batchPrice.value = null;
  priceSheet.value = true;
}

async function bulkSetPrice() {
  const op = await items.bulkSetPrice([...selected.value], batchPrice.value);
  priceSheet.value = false;
  // 用 `?? 0` 后再 `> 0` 判定，把"没填价(null)"和"真的免费(0)"都归到"已清价"文案
  const verb = batchPrice.value && batchPrice.value > 0 ? `已改价为 ¥${batchPrice.value}` : '已清价';
  await afterBulk(op, verb);
}

/* ==================== 盘点（V3-07） ==================== */

/**
 * 盘点态同样走路由 query（`?check=1`），与多选态互斥。
 *
 * 为什么互斥：两套操作条会同时出现在底部，且语义完全不同（一个是"选中后批处理"，
 * 一个是"逐张判定"）。同时开着用户根本分不清自己在哪个模式里。
 */
const stocktakeMode = computed(() => route.query.check === '1');

function enterStocktake() {
  selected.value = new Set();
  router.replace({ path: '/stock', query: { check: '1' } });
}

function exitStocktake() {
  router.replace({ path: '/stock', query: {} });
}
</script>

<template>
  <div class="h-full flex flex-col">
    <!--
      顶部区域自上而下四层，层间距统一 14px（mb-3.5），每层只放本层的内容：

        ① 标题行      页面名 + 本页操作
        ② 统计 / 筛选  三张卡，既是概览也是状态筛选
        ③ 今日待办    最高频动线，紧跟在数字下面
        ④ 搜索 + 位置  检索与筛选

      原先「标题行里塞统计文字」是跨层混排：同一行里 20px 标题 / 13px 按钮 / 12px 统计
      三种字号挤在一起，再叠上 SVG 基线问题（见 .icon 的注释），观感自然乱。
      PageHeader 自带顶部 16px 占位（TabLayout 给本页取消了滚动容器上内边距）。
    -->
    <!--
      ★ 固定头部 + 内滚列表（v1.1 F8，替代 F7 的吸顶方案）：
      头部（标题 / 概览卡 / 待办 / 搜索 / 筛选）flex-none 永不滚动；
      分组列表独占剩余空间（flex-1 内部滚动）。头部高度变化（待办展开 /
      多选 / 盘点收缩）时列表自动让位——不需要任何实测高度的吸顶偏移。
    -->
    <div class="flex-none -mx-4 px-4 pb-2.5">
    <PageHeader :title="stocktakeMode ? '盘点' : '库存'">
      <!--
        右侧操作区：三种模式填不同内容，但**容器对齐方式与控件高度一致**
        （items-center + 32px 控件），切换模式时下方内容不会跳动。
      -->
      <template #actions>
        <template v-if="stocktakeMode">
          <button type="button" class="tool-btn text-ink-2" @click="exitStocktake">
            <IconText>
              <template #icon>
                <svg class="icon icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" aria-hidden="true">
                  <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />
                </svg>
              </template>
              退出
            </IconText>
          </button>
        </template>

        <!-- 多选态：操作都在底部 BulkActionBar，这里只留一行统计元信息（纯文本，不配图标） -->
        <template v-else-if="selectMode">
          <span class="text-[12px] text-ink-3 whitespace-nowrap">{{ dateLabel }} · 在库 {{ total }} 件</span>
        </template>

        <template v-else>
          <!--
            齿轮排在「盘点 / 选择」**之前**（更靠左），不占屏幕右边缘：
            右边缘是右手拇指最自然的落点，留给高频的「选择」；齿轮是低频配置入口，往左挪一档降低误触。
            它是**独立图标**（无文字伴随），按规范用 md(20)；旁边两个按钮的图标与文字同排，用 sm(16)。
          -->
          <button
            type="button"
            class="icon-btn"
            aria-label="设置"
            @click="openSettings"
          >
            <svg class="icon icon-md" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="3.2" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l-.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>

          <button
            type="button"
            class="tool-btn text-ink-3 disabled:opacity-40"
            :disabled="total === 0"
            @click="enterStocktake"
          >
            <IconText>
              <template #icon>
                <svg class="icon icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <rect x="4.5" y="4.5" width="15" height="16" rx="2" />
                  <rect x="9" y="2.5" width="6" height="3.2" rx="1" />
                  <path d="M8.6 12.6l2.2 2.2 4.6-4.6" />
                </svg>
              </template>
              盘点
            </IconText>
          </button>

          <button
            type="button"
            class="tool-btn text-primary-700 disabled:opacity-40"
            :disabled="rows.length === 0"
            @click="enterSelect()"
          >
            <IconText>
              <template #icon>
                <svg class="icon icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <rect x="3.6" y="3.6" width="16.8" height="16.8" rx="3.4" />
                  <path d="M8 12.2l2.7 2.7L16.2 9.4" />
                </svg>
              </template>
              选择
            </IconText>
          </button>
        </template>
      </template>
    </PageHeader>

    <!-- 头部条目（吸顶块内）：多选 / 盘点态整体收掉，块缩成一行标题 -->
    <template v-if="!selectMode && !stocktakeMode">
      <!-- ② 统计 / 筛选：三张卡既是概览也是状态筛选器，点一下即过滤，再点一下取消 -->
      <div class="grid grid-cols-3 gap-2 mb-3.5">
        <StatCard
          :value="todo.length"
          label="今日待吃"
          tone="urgent"
          clickable
          :selected="statusFilter === 'urgent'"
          :aria-pressed="statusFilter === 'urgent'"
          @click="toggleStatus('urgent')"
        />
        <StatCard
          :value="overdueCount"
          label="已过期"
          tone="over"
          clickable
          :selected="statusFilter === 'overdue'"
          :aria-pressed="statusFilter === 'overdue'"
          @click="toggleStatus('overdue')"
        />
        <StatCard
          :value="total"
          label="在库"
          clickable
          :selected="statusFilter === null"
          :aria-pressed="statusFilter === null"
          @click="statusFilter = null"
        />
      </div>

      <!--
        ③ 今日待办：数字下面紧跟「是哪几件、怎么处理」，这是本页最高频的动线。
        空库时不显示收尾文案（`:show-empty="total > 0"`）。层间距由组件根元素的 mb-3.5 提供。
      -->
      <TodayTodo :show-empty="total > 0" />

      <SearchField v-model="keyword" class="mb-3.5" placeholder="搜索食材（支持别名，如 番茄）" />

      <!--
        ④ 位置筛选条吸顶。多选态下整条隐藏 —— 多选是为批量操作服务的，
        此时改筛选只会让选中项「看不见」。
        （视图切换已从本页移到「设置 → 库存设置」，这里不再有那一行常驻按钮。）
      -->
      <div class="pt-1">
        <LocationChipBar v-model="filterLoc" @manage="router.push('/locations')" />
      </div>
    </template>
    </div>

    <!-- 列表区：盘点态与常规列表共用这一个内部滚动容器。底部让位随模式变化：多选态给吸底操作条留 132px，其余给 FAB 留 84px -->
    <div
      ref="listEl"
      class="flex-1 min-h-0 overflow-y-auto no-scrollbar overscroll-contain -mx-4 px-4"
      :class="selectMode ? 'pb-[132px]' : 'pb-[84px]'"
      @scroll.passive="onListScroll"
    >
    <!-- 盘点态独占整个内容区：概览卡 / 搜索 / 筛选条 / 分组头全部不参与，避免两套操作并存 -->
    <StocktakePanel
      v-if="stocktakeMode"
      :rows="rows"
      @exit="exitStocktake"
    />

    <template v-else>

      <EmptyState
        v-if="rows.length === 0"
        :text="keyword || filterLoc ? '没有符合条件的物资' : '还没有物资'"
      >
        <template #icon>
          <svg class="icon icon-ill" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
            <rect x="2.5" y="3" width="19" height="5" rx="1.2" />
            <path d="M4.5 8v10.5a2.5 2.5 0 0 0 2.5 2.5h10a2.5 2.5 0 0 0 2.5-2.5V8" />
            <path d="M10 12h4" />
          </svg>
        </template>
        <template #action>
          <van-button type="primary" @click="openQuickAdd">添加第一件物资</van-button>
        </template>
      </EmptyState>

      <!--
        每个分组必须是独立的 <section>：sticky 元素被约束在自己的包含块内，
        分组切换时旧标题才会被新分组「顶」出去，而不是两个标题叠在同一位置。
        循环的是 `visibleSections`（窗口化切片）：见 script 中「窗口化渲染」的说明。
      -->
      <section v-for="sec in visibleSections" :key="sec.key" class="group">
        <!--
          `flat`（不分组）时 `label` 为空串，段头整体不渲染 ——
          仍走同一条 v-for 路径，不为此单开一套模板。
        -->
        <div
          v-if="sec.label"
          class="group-head sticky top-[-1px] z-[19] bg-page -mx-4 px-4 py-1.5 mt-2.5 mb-2.5 flex items-center gap-2 text-[13px] font-medium text-ink-1"
        >
          <span>{{ sec.label }}</span>
          <span class="text-[12px] text-ink-3 font-normal">{{ sec.count }}</span>
        </div>

        <!--
          折叠在分段之前已完成，所以这里每行都是**一个组**，不会有一组被切到两段的情况。
          单份组由 ItemGroupCard 自己退化成普通卡片的样子（不显示「共 N 份」与展开开关）。
        -->
        <ItemGroupCard
          v-for="r in sec.rows"
          :key="r.group.key"
          :group="r.group"
          :location="locations.byId(r.group.locationId)"
          :selectable="selectMode"
          :selected="r.group.members.every((m) => selected.has(m.id))"
          @open="openItem($event.id)"
          @consume-group="askGroupConsume"
          @consume-one="askConsume"
          @select="toggleSelectGroup"
          @longpress="enterSelectGroup"
        />
      </section>

      <!--
        窗口化提示：还有未渲染的组时告诉用户「下面还有多少」，继续滚动自动加载。
        防止「看起来到底了、其实只是窗口截断」的误判。
      -->
      <div v-if="totalGroups > visibleCount" class="text-center text-[12px] text-ink-3 py-3">
        已显示 {{ visibleCount }} / {{ totalGroups }} 组，继续滚动加载更多
      </div>
    </template>
    </div>

    <ConsumeSheet
      :model-value="consumeTarget !== null"
      :item="consumeTarget?.item ?? null"
      :type="consumeTarget?.type ?? 'consumed'"
      @update:model-value="consumeTarget = null"
      @confirm="confirmConsume"
    />

    <GroupConsumeSheet
      :model-value="groupTarget !== null"
      :group="groupTarget?.group ?? null"
      :type="groupTarget?.type ?? 'consumed'"
      @update:model-value="groupTarget = null"
      @confirm="confirmGroupConsume"
    />

    <!-- 批量操作条绝对定位在容器底部（.relative 来自 TabLayout 的 max-w 容器） -->
    <BulkActionBar
      v-if="selectMode"
      :count="selected.size"
      :total="rows.length"
      @consume="bulkConsume"
      @move="moveSheet = true"
      @price="openPriceSheet"
      @remove="confirmBulkRemove = true"
      @select-all="selectAll"
      @exit="exitSelect"
    />

    <LocationPickerSheet
      v-model="moveSheet"
      :item-name="selectedNames[0] ?? null"
      :count="selected.size"
      @confirm="bulkMove"
    />

    <ConfirmSheet
      v-model="confirmBulkRemove"
      title="批量删除"
      :message="`将从库存移除 ${selected.size} 件物资，不计入消耗统计。可在提示中撤销。`"
      confirm-text="删除"
      danger
      @confirm="bulkRemove"
    />

    <!--
      批量改价面板：一个单价输入框。
      fixedFooter 布局——输入区滚动、确认按钮固定在底部不随键盘顶起。
      与 BarcodeManageView 的编辑表单走同一套写法：
      `:value` + `@input` + `priceFromInput` + `normalizePrice` 兜底。
    -->
    <BottomSheet v-model="priceSheet" title="批量改价" fixed-footer>
      <FormField
        label="单价（元，可选）"
        for-id="batch-price"
        spacing="normal"
        :hint="`将应用到选中的 ${selected.size} 件物资。留空 = 没填价；0 = 真的免费。`"
      >
        <input
          id="batch-price"
          :value="batchPrice === null ? '' : batchPrice"
          type="number"
          step="0.01"
          min="0"
          inputmode="decimal"
          class="field-input"
          placeholder="如 1.5"
          @input="batchPrice = priceFromInput(($event.target as HTMLInputElement).value)"
        />
      </FormField>

      <template #footer>
        <div class="flex gap-2">
          <button
            type="button"
            class="flex-1 min-h-11 rounded-md border border-line-strong text-ink-2 text-[14px]"
            @click="priceSheet = false"
          >取消</button>
          <button
            type="button"
            data-autofocus
            class="flex-1 min-h-11 rounded-md bg-primary-600 text-white text-[14px] font-medium"
            @click="bulkSetPrice"
          >确定</button>
        </div>
      </template>
    </BottomSheet>
  </div>
</template>
