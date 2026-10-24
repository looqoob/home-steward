<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import type { ConsumeType, Item, Location } from '@/domain/types';
import { ENV_MAP } from '@/domain/types';
import { barColor, freshnessOf } from '@/domain/freshness';
import type { ItemGroup } from '@/domain/grouping';
import FreshnessBadge from '@/components/FreshnessBadge.vue';
import { normalizePrice, unitPriceText } from '@/domain/price';
import { fmtQty } from '@/domain/quantity';
import { formatMD } from '@/domain/dates';
import { useSettingsStore } from '@/stores/settings';
import { useToday } from '@/composables/useNow';

const props = withDefaults(
  defineProps<{
    group: ItemGroup;
    location?: Location;
    /** 多选模式：左侧复选框，右侧快捷按钮隐藏 */
    selectable?: boolean;
    selected?: boolean;
  }>(),
  { selectable: false, selected: false },
);

const emit = defineEmits<{
  (e: 'open', item: Item): void;
  (e: 'consume-group', group: ItemGroup, type: ConsumeType): void;
  (e: 'consume-one', item: Item, type: ConsumeType): void;
  (e: 'select', group: ItemGroup): void;
  (e: 'longpress', group: ItemGroup): void;
}>();

/* ---------------- 多选：长按进入 ---------------- */

/**
 * 长按进入多选 —— 与 `ItemCard` 同一套手感（500ms + 10px 位移容差）。
 *
 * 折叠后组卡取代了 `ItemCard` 成为列表主体，长按入口必须跟着搬过来，
 * 否则「长按多选」这个从 v2 就有的能力会**静默消失**。
 *
 * ⚠️ 非多选态也要允许长按：用户在普通浏览态长按应该能进入多选，
 * 此前 `if (!props.selectable) return;` 把入口彻底挡掉了。
 */
const LONGPRESS_MS = 500;
const MOVE_TOLERANCE = 10;

let timer: ReturnType<typeof setTimeout> | null = null;
const pressing = ref(false);
/** longpress 触发后设 true，抑制紧接着的 click 事件，避免反选刚选中的整组 */
const suppressClick = ref(false);
let startX = 0;
let startY = 0;

function clearTimer() {
  if (timer) clearTimeout(timer);
  timer = null;
  pressing.value = false;
}

function onPointerDown(e: PointerEvent) {
  // ⚠️ 删除 `if (!props.selectable) return;`：它把非多选态的长按入口彻底挡掉了
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  startX = e.clientX;
  startY = e.clientY;
  pressing.value = true;
  suppressClick.value = false;
  clearTimer();
  timer = setTimeout(() => {
    timer = null;
    pressing.value = false;
    suppressClick.value = true;
    emit('longpress', props.group);
  }, LONGPRESS_MS);
}

function onPointerMove(e: PointerEvent) {
  if (!pressing.value) return;
  if (Math.abs(e.clientX - startX) > MOVE_TOLERANCE || Math.abs(e.clientY - startY) > MOVE_TOLERANCE) {
    clearTimer();
  }
}

/** click handler：longpress 后抑制一次，防止反选整组 */
function onClick() {
  if (suppressClick.value) {
    suppressClick.value = false;
    return;
  }
  if (props.selectable) emit('select', props.group);
  else emit('open', props.group.lead);
}

onBeforeUnmount(clearTimer);

const settings = useSettingsStore();
const today = useToday();

/**
 * 状态色 / 徽标 / 进度条**一律取 lead（组内最早到期那份）**。
 *
 * 为什么不取「最新的那份」或「平均」：那份快过期的才是你现在该处理的。
 * 如果按最新那份显示绿色，用户会以为不着急，等它也过期时就晚了 ——
 * 这正是「真合并」方案的根本缺陷，在这里被显式规避。
 */
const leadFresh = computed(() => freshnessOf(props.group.lead, today.value, settings.settings));
const env = computed(() => (props.location ? ENV_MAP[props.location.env] : null));

/**
 * 默认展开策略：≤ 2 份展开，> 2 份折叠。
 *
 * 两份是「一眼能看完」的上限，超过就该先看卡头决定要不要展开；
 * 全部默认展开会让长列表被同名卡片撑爆，全部折叠则多一次无谓点击。
 * ⚠️ 展开状态**不持久化**（刷新回默认），避免多一个要同步的本地状态。
 * ⚠️ 份数变化时要重算默认值（REV-21）：3 份消耗 1 份后应自动展开、
 * 2 份变 3 份应收起。`:key` 是稳定的 `group.key`，不 watch 的话初始值永远不更新。
 */
const expanded = ref(props.group.members.length <= 2);
watch(
  () => props.group.members.length,
  (n) => {
    expanded.value = n <= 2;
  },
);

const memberRows = computed(() =>
  props.group.members.map((m, i) => ({
    item: m,
    index: i + 1,
    f: freshnessOf(m, today.value, settings.settings),
    // 每份各自显示自己的单价：两次买入价格不同是很正常的，混成一个数反而失真
    priceText: unitPriceText(m.price, m.unit),
  })),
);

/**
 * 组卡的单价。
 *
 * 多份价格不同时给**区间**（`¥1.5–2/个`）而不是取平均或取 lead：
 * 平均会算出一个谁都没买过的价格，取 lead 则会让后面几份的价格凭空消失。
 * 全部没填价时返回空串（与 `ItemCard` 同一口径：没价就不占位置）。
 */
const groupPriceText = computed(() => {
  const ps = props.group.members
    .map((m) => normalizePrice(m.price))
    .filter((p): p is number => p !== null);
  if (!ps.length) return '';
  const lo = Math.min(...ps);
  const hi = Math.max(...ps);
  const unit = props.group.unit || '个';
  // audit-ignore: money-format（单价区间「¥1.5–2/个」不是总额，fmtMoney 的两位小数反而不对）
  return lo === hi ? `¥${fmtQty(lo)}/${unit}` : `¥${fmtQty(lo)}–${fmtQty(hi)}/${unit}`;
});

function totalQtyText(): string {
  return `${fmtQty(props.group.totalQuantity)} ${props.group.unit}`.trim();
}

/**
 * 卡头的到期摘要。
 *
 * 单份组是绝大多数情况（绝大多数物品没有同名邻居），此时**只说它自己**：
 * 有到期日就写日期，没到期日就什么都不写 —— 写「共 1 份」是纯噪音，
 * 而且会让「牛奶 1 盒」看起来像是被合并过。
 */
const dueSummary = computed(() => {
  const g = props.group;
  if (g.members.length === 1) {
    return g.lead.expireAt ? `${formatMD(g.lead.expireAt)} 到期` : '';
  }
  // 多份但部分没有到期日：只报份数，因为「最早」无从谈起
  if (!g.allDated) return `共 ${g.members.length} 份`;
  const dates = [...new Set(g.members.map((m) => m.expireAt as string))];
  return dates.length === 1
    ? `${formatMD(dates[0] as string)} 到期`
    : `最早 ${formatMD(g.lead.expireAt as string)} 到期`;
});
</script>

<template>
  <article
    class="card p-3 mb-2.5 shadow-card"
    :class="[
      selectable ? '' : 'cursor-pointer',
      selected ? 'border-primary-600 ring-2 ring-primary-100' : 'border-line',
    ]"
    :style="pressing ? 'opacity:.7' : ''"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="clearTimer"
    @pointercancel="clearTimer"
    @pointerleave="clearTimer"
  >
    <div class="flex gap-3 items-start">
      <button
        v-if="selectable"
        type="button"
        role="checkbox"
        :aria-checked="selected"
        :aria-label="`选择 ${props.group.name}`"
        class="relative w-[22px] h-[22px] flex-none rounded-md border flex items-center justify-center text-[12px] leading-none mt-0.5 cursor-pointer before:absolute before:content-[''] before:-inset-[11px]"
        :class="selected ? 'bg-primary-600 border-primary-600 text-white' : 'bg-card border-line-strong text-transparent'"
        @click.stop="emit('select', props.group)"
      >✓</button>

      <!--
        整块主操作区是一个 button：点它跳到 lead 的详情（「这一份我要处理」）。
        展开与否交给右侧那个独立的 chevron 按钮 —— 一个元素不能同时承担两种含义，
        否则用户永远猜不到点一下会发生什么。
      -->
      <button
        type="button"
        class="flex-1 min-w-0 flex gap-3 items-start bg-transparent border-0 p-0 text-left text-[14px] text-ink-1"
        :class="selectable ? 'cursor-default' : 'cursor-pointer'"
        :aria-label="`${props.group.name}，共 ${props.group.members.length} 份，${dueSummary}`"
        @click="onClick"
      >
        <span class="w-10 h-10 rounded-md flex-none flex items-center justify-center text-[15px] font-medium text-primary-700 bg-primary-50">
          {{ props.group.icon }}
        </span>
        <span class="flex-1 min-w-0 flex flex-col gap-1">
          <span class="flex items-center gap-2 min-w-0">
            <span class="text-[15px] font-medium truncate">{{ props.group.name }}</span>
            <!-- 只有多份才亮「共 N 份」：单份时这个标签是纯噪音 -->
            <span
              v-if="props.group.members.length > 1"
              class="text-[12px] px-2 py-0.5 rounded-full bg-sunken text-ink-2 flex-none whitespace-nowrap"
            >共 {{ props.group.members.length }} 份</span>
            <FreshnessBadge :state="leadFresh.state" :label="leadFresh.label" />
          </span>
          <!--
            v1.1 F15-1 三行化：属性行（数量 · 单价 · 位置）+ 末行（进度条 + 到期日）。
            此前「到期日」挤在属性行里把位置标签 wrap 到第三行，每张卡固定多占 ~20px；
            到期日与进度条同属「剩余保质期」语义，放一行后卡片恒定三行。
          -->
          <span class="flex items-center gap-1.5 text-[12px] text-ink-3 flex-wrap mt-0.5">
            <span class="tabular-nums">{{ totalQtyText() }}</span>
            <span v-if="groupPriceText" class="tabular-nums">{{ groupPriceText }}</span>
            <EnvDotLabel v-if="props.location" :color="env?.color ?? '#6a7886'" :name="props.location.name" />
          </span>
          <span
            v-if="leadFresh.progress !== null || dueSummary"
            class="flex items-center gap-2 mt-1"
          >
            <span v-if="leadFresh.progress !== null" class="flex-1 block h-1 rounded bg-sunken overflow-hidden">
              <i class="block h-full rounded" :style="{ width: (leadFresh.progress * 100).toFixed(0) + '%', background: barColor(leadFresh.state) }"></i>
            </span>
            <span v-if="dueSummary" class="text-[12px] text-ink-2 flex-none whitespace-nowrap">{{ dueSummary }}</span>
          </span>
        </span>
      </button>

      <div v-if="!selectable" class="flex gap-2.5 flex-none items-center">
        <button
          type="button"
          class="relative w-9 h-9 rounded-md border border-line-strong bg-card flex items-center justify-center text-primary-700 hover:bg-sunken before:absolute before:content-[''] before:-inset-2"
          :aria-label="`${props.group.name} 用掉了${props.group.members.length > 1 ? '（默认用最早到期的那份）' : ''}`"
          title="用掉了"
          @click="emit('consume-group', props.group, 'consumed')"
        >✓</button>
        <!-- v1.1 F10：lead 已过期时 ✕ 升级为红底白字——过期物的主导动作是「扔掉记浪费」， -->
        <!-- 与待办区的红底「扔掉」同一视觉语言，不靠用户从两个灰按钮里猜哪个该点 -->
        <button
          type="button"
          class="relative w-9 h-9 rounded-md border flex items-center justify-center hover:bg-sunken before:absolute before:content-[''] before:-inset-2"
          :class="leadFresh.state === 'over'
            ? 'bg-danger border-danger text-white'
            : 'border-line-strong bg-card text-danger'"
          :aria-label="`${props.group.name} 扔掉了${props.group.members.length > 1 ? '（默认扔最早到期的那份）' : ''}`"
          title="扔掉了"
          @click="emit('consume-group', props.group, 'wasted')"
        >✕</button>
        <!-- 只在多份时才给展开开关：单份没有「每份」可看 -->
        <button
          v-if="props.group.members.length > 1"
          type="button"
          class="w-7 h-9 flex items-center justify-center text-ink-3"
          :aria-expanded="expanded"
          :aria-label="expanded ? `收起 ${props.group.name} 的各份明细` : `展开 ${props.group.name} 的各份明细`"
          @click="expanded = !expanded"
        >
          <svg class="icon icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" :style="{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform .18s' }"><polyline points="6 9 12 15 18 9" /></svg>
        </button>
      </div>
    </div>

    <!--
      展开区：每一份一行，各自带自己的到期日与数量。
      行内两个小按钮只作用于**这一份**；组卡右上角的 ✓/✕ 才是整组的（FEFO 顺延）。
    -->
    <div v-if="expanded && props.group.members.length > 1" class="mt-2.5 pt-2.5 border-t border-line">
      <div
        v-for="row in memberRows"
        :key="row.item.id"
        class="flex items-center gap-2 py-1.5"
      >
        <span class="w-4 text-[12px] text-ink-3 flex-none text-center">{{ row.index }}</span>
        <span class="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
          <span class="text-[13px] text-ink-1">{{ fmtQty(row.item.quantity) }} {{ row.item.unit }}</span>
          <span v-if="row.priceText" class="text-[12px] text-ink-3 tabular-nums">{{ row.priceText }}</span>
          <span class="text-[12px] text-ink-3">{{ row.item.expireAt ? formatMD(row.item.expireAt) + ' 到期' : '无到期日' }}</span>
          <FreshnessBadge :state="row.f.state" :label="row.f.label" size="sm" />
          <!-- 第 1 份 = FEFO 的下一份，明确标出来，用户不用自己算 -->
          <span v-if="row.index === 1" class="text-[11px] px-1.5 py-0.5 rounded bg-primary-50 text-primary-700">下一份</span>
        </span>
        <span class="flex gap-1.5 flex-none">
          <button
            type="button"
            class="relative w-7 h-7 rounded border border-line-strong text-[12px] text-primary-700 flex items-center justify-center before:absolute before:content-[''] before:-inset-2"
            :aria-label="`用掉第 ${row.index} 份 ${props.group.name}`"
            @click="emit('consume-one', row.item, 'consumed')"
          >✓</button>
          <button
            type="button"
            class="relative w-7 h-7 rounded border border-line-strong text-[12px] text-danger flex items-center justify-center before:absolute before:content-[''] before:-inset-2"
            :aria-label="`扔掉第 ${row.index} 份 ${props.group.name}`"
            @click="emit('consume-one', row.item, 'wasted')"
          >✕</button>
        </span>
      </div>
    </div>
  </article>
</template>
