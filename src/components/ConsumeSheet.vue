<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { ConsumeType, Item } from '@/domain/types';
import BottomSheet from '@/components/BottomSheet.vue';
import QtyStepper from '@/components/QtyStepper.vue';
// 金额口径走 domain/price 的 amountOf：以前这里手抄了一版 `round2(price * qty)`，
// 与 bulk.buildConsumeLog 是两份实现，迟早漂移；而且它只挡 null/undefined，
// 挡不住旧备份带进来的脏值（字符串 / 负数 → NaN）。
import { amountOf, fmtMoney } from '@/domain/price';
import { fmtQty } from '@/domain/quantity';

const props = defineProps<{
  modelValue: boolean;
  /** 待处理的商品；为 null 时弹层不显示内容 */
  item: Item | null;
  /** `'consumed'` 用掉了 / `'wasted'` 扔掉了，只影响标题与按钮文案 */
  type: ConsumeType;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void;
  (e: 'confirm', qty: number): void;
}>();

const qty = ref(1);

/** 标题与无障碍名称共用一份文案，避免两处各写一遍三元表达式 */
const titleText = computed(() => (props.type === 'consumed' ? '用掉了多少' : '扔掉了多少'));

const max = computed(() => props.item?.quantity ?? 1);
/** 剩余量不足 1（如 0.5 斤）时步长跟着变小，别让 stepper 一步跨过上限 */
const step = computed(() => (max.value >= 2 ? 1 : 0.5));
const min = computed(() => Math.min(step.value, max.value));
/** 本次金额 = 单价 × 数量；没填单价 / 单价是脏值时返回 null（不显示这一行） */
const amount = computed(() => amountOf(props.item?.price, qty.value));
const quick = computed(() => [1, 2, 5].filter((n) => n <= max.value));

function clamp(v: number): number {
  if (!Number.isFinite(v)) return min.value;
  return Math.round(Math.min(max.value, Math.max(min.value, v)) * 100) / 100;
}

function setQty(v: number) {
  qty.value = clamp(v);
}

function cancel() {
  emit('update:modelValue', false);
}

function confirm() {
  // 顺序要紧：先 confirm 再关闭。若先发 update:modelValue，父组件里「当前处理对象」
  // 会被清空，confirm 处理器拿到的就是 null（撤销目标丢失的坑）。
  emit('confirm', clamp(qty.value));
  emit('update:modelValue', false);
}

/** 焦点、Esc、遮罩点击由 BottomSheet 统一处理，这里只保留「打开时重置数量」 */
watch(
  () => props.modelValue,
  (open) => {
    if (!open) return;
    // 用掉默认 1（大多时候是部分消耗：20 个鸡蛋这次用 2 个）；
    // 扔掉默认**全部**（v1.1 F10）——扔东西几乎总是「这份坏了」，整个处理掉。
    // 此前两种类型都默认 1，过期丢弃要多点一次「全部」，浪费登记的录入成本越高
    // 越没人记，「易浪费」建议就越没数据。
    qty.value = clamp(props.type === 'wasted' ? max.value : 1);
  },
);
</script>

<template>
  <BottomSheet
    v-if="item"
    :model-value="modelValue"
    :title="titleText"
    :aria-label="titleText"
    @update:model-value="(v) => emit('update:modelValue', v)"
  >
      <p class="text-[13px] text-ink-2 leading-relaxed mb-4">
        {{ item.name }} · 在库 {{ fmtQty(item.quantity) }}{{ item.unit }}
        <template v-if="amount !== null"> · 本次约 {{ fmtMoney(amount) }}</template>
      </p>

      <QtyStepper
        v-model="qty"
        class="my-1 mb-3"
        size="lg"
        :max="max"
        :unit="item.unit"
        :aria-label="`数量，最多 ${max}`"
      />

      <div class="flex flex-wrap gap-1.5 mb-4">
        <button
          v-for="n in quick"
          :key="n"
          type="button"
          class="border text-[13px] px-3 py-1.5 rounded-full cursor-pointer min-h-[34px] inline-flex items-center gap-1.5"
          :class="qty === n
            ? 'border-primary-600 bg-primary-50 text-primary-700 font-medium'
            : 'border-line bg-card text-ink-2'"
          @click="setQty(n)"
        >
          {{ fmtQty(n) }}{{ item.unit }}
        </button>
        <button
          type="button"
          class="border text-[13px] px-3 py-1.5 rounded-full cursor-pointer min-h-[34px] inline-flex items-center gap-1.5"
          :class="qty === max
            ? 'border-primary-600 bg-primary-50 text-primary-700 font-medium'
            : 'border-line bg-card text-ink-2'"
          @click="setQty(max)"
        >
          全部用完
        </button>
      </div>

      <div class="flex gap-2">
        <van-button class="flex-1" @click="cancel">取消</van-button>
        <van-button
          data-autofocus
          class="flex-1"
          :type="type === 'wasted' ? 'danger' : 'primary'"
          @click="confirm"
        >
          {{ type === 'consumed' ? '用掉了' : '扔掉了' }} {{ fmtQty(qty) }}{{ item.unit }}
        </van-button>
      </div>
  </BottomSheet>
</template>
