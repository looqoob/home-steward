<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import type { ConsumeType, Item } from '@/domain/types';
import { barColor, freshnessOf } from '@/domain/freshness';
import type { ItemGroup } from '@/domain/grouping';
import { formatMD } from '@/domain/dates';
import { useSettingsStore } from '@/stores/settings';
import { todayStr } from '@/domain/dates';
import { amountOf } from '@/domain/price';

const props = defineProps<{
  modelValue: boolean;
  /** 为 null 时弹层不显示内容 */
  group: ItemGroup | null;
  type: ConsumeType;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void;
  /**
   * 确认消耗。
   * @param items 被扣的份（通常 1 份；单份不够时由父级顺延到下一份）
   * @param quantity 本次扣多少
   */
  (e: 'confirm', items: Item[], quantity: number): void;
}>();

const settings = useSettingsStore();
const today = todayStr();

/** 当前选中的那份，默认 FEFO 的第一份（最早到期） */
const pickedId = ref<string | null>(null);
const qty = ref(1);
const confirmBtn = ref<HTMLButtonElement | null>(null);

const picked = computed<Item | null>(() => {
  const g = props.group;
  if (!g) return null;
  return g.members.find((m) => m.id === pickedId.value) ?? g.lead;
});

const max = computed(() => picked.value?.quantity ?? 1);
/** 剩余量不足 1（如 0.5 斤）时步长跟着变小，别让 stepper 一步跨过上限 */
const step = computed(() => (max.value >= 2 ? 1 : 0.5));
const min = computed(() => Math.min(step.value, max.value));

/** 本次金额 = 选中那份的单价 × 数量；没填单价 / 脏值 → null（不显示） */
const amount = computed(() => amountOf(picked.value?.price, qty.value));

/**
 * 「下一份」提示文案。
 *
 * 只在选中的是**非 FEFO 首份**、且首份还剩着的时候出现 ——
 * 「你正在喝 10-15 那盒，而 10-08 那盒还剩 1 盒」这件事必须说出来，
 * 否则这组折叠就白做了。
 */
const fefoWarning = computed(() => {
  const g = props.group;
  const p = picked.value;
  if (!g || !p || g.members.length < 2) return '';
  const lead = g.lead;
  if (lead.id === p.id) return '';
  const lf = freshnessOf(lead, today, settings.settings);
  return `还有更早到期的：第 1 份 ${formatMD(lead.expireAt ?? '')}（${lf.label}）`;
});

function clamp(v: number): number {
  if (!Number.isFinite(v)) return min.value;
  return Math.round(Math.min(max.value, Math.max(min.value, v)) * 100) / 100;
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}

function cancel() {
  emit('update:modelValue', false);
}

function confirm() {
  const p = picked.value;
  if (!p) return;
  // 顺序要紧：先 confirm 再关闭。若先发 update:modelValue，父组件的「当前处理对象」
  // 会被清空，confirm 处理器拿到的就是 null（撤销目标丢失的坑，与 ConsumeSheet 同理）。
  emit('confirm', [p], clamp(qty.value));
  emit('update:modelValue', false);
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') cancel();
}

watch(
  () => props.modelValue,
  async (open) => {
    if (open && props.group) {
      // 每次打开都重置到 FEFO 首份：默认值必须是「该先吃的那份」，不能是上次选过的
      pickedId.value = props.group.lead.id;
      qty.value = clamp(1);
      await nextTick();
      confirmBtn.value?.focus();
      window.addEventListener('keydown', onKey);
    } else {
      window.removeEventListener('keydown', onKey);
    }
  },
);

onBeforeUnmount(() => window.removeEventListener('keydown', onKey));
</script>

<template>
  <div v-if="modelValue && group && picked">
    <div class="absolute inset-0 bg-mask z-28" @click="cancel"></div>
    <div
      class="absolute left-0 right-0 bottom-0 bg-card rounded-t-3xl z-29 max-h-[86%] flex flex-col"
      role="dialog"
      aria-modal="true"
      :aria-label="type === 'consumed' ? '用掉了多少' : '扔掉了多少'"
    >
      <!--
        滚动区与按钮条是**兄弟节点**，不是「滚动区 + sticky 按钮条」。
        sticky 会被包含块（滚动容器的内容盒）钳制，容器的 padding 又会把按钮条
        整体朝内推，缝里会漏出滚动内容 —— 这是 QuickAddSheet 踩过的坑，别改回去。
      -->
      <div class="flex-1 min-h-0 overflow-y-auto overscroll-contain no-scrollbar pt-2 px-4">
        <div class="w-9 h-1 rounded-full bg-line-strong mx-auto mb-3"></div>
        <h3 class="text-[16px] font-semibold mb-1">
          {{ group.members.length > 1 ? `用掉「${group.name}」的哪一份` : (type === 'consumed' ? '用掉了多少' : '扔掉了多少') }}
        </h3>
        <p class="text-[13px] text-ink-2 leading-relaxed mb-3">
          共 {{ group.members.length }} 份，合计 {{ fmt(group.totalQuantity) }}{{ group.unit }}
          <template v-if="amount !== null"> · 本次约 ¥{{ amount.toFixed(2) }}</template>
        </p>

        <!--
          多份时才列出来让你选。单份时列出来只是噪音，直接进入数量选择。
          每行左侧的色条 = 该份的新鲜度，一眼能看出哪份最该吃。
        -->
        <div v-if="group.members.length > 1" class="flex flex-col gap-1.5 mb-4">
          <button
            v-for="(m, i) in group.members"
            :key="m.id"
            type="button"
            class="flex items-center gap-2.5 w-full text-left border rounded-md px-2.5 py-2 min-h-11"
            :class="picked.id === m.id ? 'border-primary-600 bg-primary-50' : 'border-line bg-card'"
            :aria-pressed="picked.id === m.id"
            @click="pickedId = m.id; qty = clamp(qty)"
          >
            <span class="w-5 h-5 rounded-full border flex-none flex items-center justify-center text-[11px]"
              :class="picked.id === m.id ? 'bg-primary-600 border-primary-600 text-white' : 'border-line-strong text-transparent'">✓</span>
            <span class="w-1.5 self-stretch rounded-full flex-none" :style="{ background: barColor(freshnessOf(m, today, settings.settings).state) }"></span>
            <span class="flex-1 min-w-0">
              <span class="block text-[13px] text-ink-1">
                第 {{ i + 1 }} 份 · {{ fmt(m.quantity) }} {{ m.unit }}
                <span v-if="i === 0" class="text-[11px] px-1.5 py-0.5 rounded bg-primary-50 text-primary-700 ml-1">下一份</span>
              </span>
              <span class="block text-[12px] text-ink-3">{{ m.expireAt ? `${formatMD(m.expireAt)} 到期` : '无到期日' }} · {{ freshnessOf(m, today, settings.settings).label }}</span>
            </span>
          </button>
        </div>

        <div
          v-if="fefoWarning"
          class="text-[12px] text-urgent-fg bg-urgent-bg rounded-md px-2.5 py-2 mb-3 leading-relaxed"
        >{{ fefoWarning }}</div>

        <div class="flex items-center gap-2 my-1 mb-3">
          <button
            type="button"
            class="relative w-11 h-11 flex-none rounded-md border border-line-strong bg-card text-ink-1 cursor-pointer flex items-center justify-center disabled:opacity-40 before:absolute before:content-[''] before:-inset-2"
            :disabled="qty <= min"
            :aria-label="`减少 ${step}`"
            @click="qty = clamp(qty - step)"
          >
            <svg class="icon icon-md" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" aria-hidden="true"><line x1="5.5" y1="12" x2="18.5" y2="12" /></svg>
          </button>
          <input
            :value="qty"
            type="number"
            class="flex-1 min-w-0 text-center text-[16px] text-ink-1 bg-transparent border-0 p-0 focus:outline-none"
            :step="step"
            :min="min"
            :max="max"
            :aria-label="`数量，最多 ${max}`"
            @input="qty = clamp(Number(($event.target as HTMLInputElement).value))"
          />
          <span class="flex-none text-[14px] text-ink-2">{{ picked.unit }}</span>
          <button
            type="button"
            class="relative w-11 h-11 flex-none rounded-md border border-line-strong bg-card text-ink-1 cursor-pointer flex items-center justify-center disabled:opacity-40 before:absolute before:content-[''] before:-inset-2"
            :disabled="qty >= max"
            :aria-label="`增加 ${step}`"
            @click="qty = clamp(qty + step)"
          >
            <svg class="icon icon-md" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" aria-hidden="true"><line x1="12" y1="5.5" x2="12" y2="18.5" /><line x1="5.5" y1="12" x2="18.5" y2="12" /></svg>
          </button>
        </div>

        <div class="flex flex-wrap gap-1.5 mb-4">
          <button
            v-for="n in [1, 2, 5].filter((x) => x <= max)"
            :key="n"
            type="button"
            class="border text-[13px] px-3 py-1.5 rounded-full cursor-pointer min-h-[34px] inline-flex items-center gap-1.5"
            :class="qty === n ? 'border-primary-600 bg-primary-50 text-primary-700 font-medium' : 'border-line bg-card text-ink-2'"
            @click="qty = clamp(n)"
          >{{ fmt(n) }}{{ picked.unit }}</button>
          <button
            type="button"
            class="border text-[13px] px-3 py-1.5 rounded-full cursor-pointer min-h-[34px] inline-flex items-center gap-1.5"
            :class="qty === max ? 'border-primary-600 bg-primary-50 text-primary-700 font-medium' : 'border-line bg-card text-ink-2'"
            @click="qty = clamp(max)"
          >这一份全部</button>
        </div>
      </div>

      <div class="flex-none bg-card px-4 pt-3 pb-[calc(20px+env(safe-area-inset-bottom,0px))] border-t border-line">
        <div class="flex gap-2">
          <van-button class="flex-1" @click="cancel">取消</van-button>
          <van-button
            ref="confirmBtn"
            class="flex-1"
            :type="type === 'wasted' ? 'danger' : 'primary'"
            @click="confirm"
          >
            {{ type === 'consumed' ? '用掉了' : '扔掉了' }} {{ fmt(qty) }}{{ picked.unit }}
          </van-button>
        </div>
      </div>
    </div>
  </div>
</template>
