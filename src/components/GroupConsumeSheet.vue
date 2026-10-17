<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { ConsumeType, Item } from '@/domain/types';
import BottomSheet from '@/components/BottomSheet.vue';
import QtyStepper from '@/components/QtyStepper.vue';
import { barColor, freshnessOf } from '@/domain/freshness';
import type { ItemGroup } from '@/domain/grouping';
import { formatMD } from '@/domain/dates';
import { useSettingsStore } from '@/stores/settings';
import { todayStr } from '@/domain/dates';
import { amountOf } from '@/domain/price';
import { fmtQty } from '@/domain/quantity';

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

/** 标题与无障碍名称共用一份文案 */
const titleText = computed(() => {
  const g = props.group;
  if (g && g.members.length > 1) return `用掉「${g.name}」的哪一份`;
  return props.type === 'consumed' ? '用掉了多少' : '扔掉了多少';
});

const picked = computed<Item | null>(() => {
  const g = props.group;
  if (!g) return null;
  return g.members.find((m) => m.id === pickedId.value) ?? g.lead;
});

const max = computed(() => picked.value?.quantity ?? 1);
/** 步长自适应由 QtyStepper 内部处理；这里只保留 clamp 所需的下限 */
const min = computed(() => Math.min(0.5, max.value));

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

/** 焦点、Esc、遮罩点击由 BottomSheet 统一处理，这里只保留「打开时重置到 FEFO 首份」 */
watch(
  () => props.modelValue,
  (open) => {
    if (open && props.group) {
      // 每次打开都重置到 FEFO 首份：默认值必须是「该先吃的那份」，不能是上次选过的
      pickedId.value = props.group.lead.id;
      qty.value = clamp(1);
    }
  },
);
</script>

<template>
  <BottomSheet
    v-if="group && picked"
    :model-value="modelValue"
    :title="titleText"
    :aria-label="titleText"
    fixed-footer
    title-spacing="tight"
    @update:model-value="(v) => emit('update:modelValue', v)"
  >
        <p class="text-[13px] text-ink-2 leading-relaxed mb-3">
          共 {{ group.members.length }} 份，合计 {{ fmtQty(group.totalQuantity) }}{{ group.unit }}
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
                第 {{ i + 1 }} 份 · {{ fmtQty(m.quantity) }} {{ m.unit }}
                <span v-if="i === 0" class="text-[11px] px-1.5 py-0.5 rounded bg-primary-50 text-primary-700 ml-1">下一份</span>
              </span>
              <span class="block text-[12px] text-ink-3">{{ m.expireAt ? `${formatMD(m.expireAt)} 到期` : '无到期日' }} · {{ freshnessOf(m, today, settings.settings).label }}</span>
            </span>
          </button>
        </div>

        <div
          v-if="fefoWarning"
          class="tip tip-urgent mb-3"
        >{{ fefoWarning }}</div>

        <QtyStepper
          v-model="qty"
          class="my-1 mb-3"
          size="lg"
          :max="max"
          :unit="picked.unit"
          :aria-label="`数量，最多 ${max}`"
        />

        <div class="flex flex-wrap gap-1.5 mb-4">
          <button
            v-for="n in [1, 2, 5].filter((x) => x <= max)"
            :key="n"
            type="button"
            class="border text-[13px] px-3 py-1.5 rounded-full cursor-pointer min-h-[34px] inline-flex items-center gap-1.5"
            :class="qty === n ? 'border-primary-600 bg-primary-50 text-primary-700 font-medium' : 'border-line bg-card text-ink-2'"
            @click="qty = clamp(n)"
          >{{ fmtQty(n) }}{{ picked.unit }}</button>
          <button
            type="button"
            class="border text-[13px] px-3 py-1.5 rounded-full cursor-pointer min-h-[34px] inline-flex items-center gap-1.5"
            :class="qty === max ? 'border-primary-600 bg-primary-50 text-primary-700 font-medium' : 'border-line bg-card text-ink-2'"
            @click="qty = clamp(max)"
          >这一份全部</button>
        </div>

    <template #footer>
      <div class="flex gap-2">
        <van-button class="flex-1" @click="cancel">取消</van-button>
        <van-button
          data-autofocus
          class="flex-1"
          :type="type === 'wasted' ? 'danger' : 'primary'"
          @click="confirm"
        >
          {{ type === 'consumed' ? '用掉了' : '扔掉了' }} {{ fmtQty(qty) }}{{ picked.unit }}
        </van-button>
      </div>
    </template>
  </BottomSheet>
</template>
