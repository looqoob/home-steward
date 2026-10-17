<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import type { ConsumeType, Item } from '@/domain/types';
// 金额口径走 domain/price 的 amountOf：以前这里手抄了一版 `round2(price * qty)`，
// 与 bulk.buildConsumeLog 是两份实现，迟早漂移；而且它只挡 null/undefined，
// 挡不住旧备份带进来的脏值（字符串 / 负数 → NaN）。
import { amountOf } from '@/domain/price';
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
const confirmBtn = ref<HTMLButtonElement | null>(null);

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

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') cancel();
}

watch(
  () => props.modelValue,
  async (open) => {
    if (open) {
      // 默认 1（不够就取上限），不默认「全部」——大多时候是部分消耗
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
  <div v-if="modelValue && item">
    <div class="absolute inset-0 bg-mask z-28" @click="cancel"></div>
    <div
      class="absolute left-0 right-0 bottom-0 bg-card rounded-t-3xl pt-2 px-4 pb-[calc(20px+env(safe-area-inset-bottom,0px))] z-29 max-h-[86%] overflow-y-auto overscroll-contain no-scrollbar"
      role="dialog"
      aria-modal="true"
      :aria-label="type === 'consumed' ? '用掉了多少' : '扔掉了多少'"
    >
      <div class="w-9 h-1 rounded-full bg-line-strong mx-auto mb-3"></div>
      <h3 class="text-[16px] font-semibold mb-3.5">{{ type === 'consumed' ? '用掉了多少' : '扔掉了多少' }}</h3>
      <p class="text-[13px] text-ink-2 leading-relaxed mb-4">
        {{ item.name }} · 在库 {{ fmtQty(item.quantity) }}{{ item.unit }}
        <template v-if="amount !== null"> · 本次约 ¥{{ amount.toFixed(2) }}</template>
      </p>

      <div class="flex items-center gap-2 my-1 mb-3">
        <button
          type="button"
          class="relative w-11 h-11 flex-none rounded-md border border-line-strong bg-card text-ink-1 cursor-pointer flex items-center justify-center disabled:opacity-40 before:absolute before:content-[''] before:-inset-2"
          :disabled="qty <= min"
          :aria-label="`减少 ${step}`"
          @click="setQty(qty - step)"
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
          @input="setQty(Number(($event.target as HTMLInputElement).value))"
        />
        <span class="flex-none text-[14px] text-ink-2">{{ item.unit }}</span>
        <button
          type="button"
          class="relative w-11 h-11 flex-none rounded-md border border-line-strong bg-card text-ink-1 cursor-pointer flex items-center justify-center disabled:opacity-40 before:absolute before:content-[''] before:-inset-2"
          :disabled="qty >= max"
          :aria-label="`增加 ${step}`"
          @click="setQty(qty + step)"
        >
          <svg class="icon icon-md" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" aria-hidden="true"><line x1="12" y1="5.5" x2="12" y2="18.5" /><line x1="5.5" y1="12" x2="18.5" y2="12" /></svg>
        </button>
      </div>

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
          ref="confirmBtn"
          class="flex-1"
          :type="type === 'wasted' ? 'danger' : 'primary'"
          @click="confirm"
        >
          {{ type === 'consumed' ? '用掉了' : '扔掉了' }} {{ fmtQty(qty) }}{{ item.unit }}
        </van-button>
      </div>
    </div>
  </div>
</template>
