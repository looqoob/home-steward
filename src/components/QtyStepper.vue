<script setup lang="ts">
/**
 * 数量步进器：− 输入框 ＋（可选单位）。
 *
 * 抽出来的原因：ConsumeSheet / GroupConsumeSheet / ItemEditView×2 / QuickAddSheet /
 * ShoppingInboundRow 共 6 处各写一份，按钮尺寸无规范地混用 w-8 / w-9 / w-11，
 * clamp 行为也不一致（有的能输负数、有的不能）。这里把「步长自适应、上下限钳制、
 * 热区、单位后缀」一次定义好，调用点只传业务参数。
 *
 * 步长约定：`step: 'auto'` 时，上限 ≥2 用 1，否则用 0.5 ——
 * 剩 0.5 斤的东西不能被一步跨过。
 */
import { computed, ref, watch } from 'vue';

const props = withDefaults(
  defineProps<{
    modelValue: number;
    /** 下限，默认 0.5（半份也是合法数量） */
    min?: number;
    /** 上限，默认不限制（由调用点按库存量传入） */
    max?: number;
    /** 步长；'auto' 按上限自动在 1 / 0.5 之间选择 */
    step?: number | 'auto';
    /** 单位后缀；空串则不渲染 */
    unit?: string;
    /** 按钮尺寸：sm=32px / md=36px / lg=44px（44 为推荐触控尺寸） */
    size?: 'sm' | 'md' | 'lg';
    /** 输入框的无障碍名称 */
    ariaLabel?: string;
    /** 输入框 id，供外部 <label for> 关联 */
    inputId?: string;
  }>(),
  {
    min: 0.5,
    max: Number.POSITIVE_INFINITY,
    step: 'auto',
    unit: '',
    size: 'md',
    ariaLabel: '数量',
    inputId: undefined,
  },
);

const emit = defineEmits<{ (e: 'update:modelValue', v: number): void }>();

const stepValue = computed(() =>
  props.step === 'auto' ? (props.max >= 2 ? 1 : 0.5) : props.step,
);

/** 上限可能小于下限（如只剩 0.2），此时以下限为准，避免 clamp 出负数 */
const lower = computed(() => Math.min(props.min, props.max));

/** 保留两位小数，避免加减出 0.30000000000000004 */
function clamp(v: number): number {
  if (!Number.isFinite(v)) return lower.value;
  return Math.round(Math.min(props.max, Math.max(lower.value, v)) * 100) / 100;
}

function set(v: number) {
  emit('update:modelValue', clamp(v));
}

/**
 * 输入框草稿。
 *
 * 不能把 `modelValue` 直接当 `:value` 用：输入「0.5」时刚敲下 `0`，
 * `clamp(0)` 会立刻把值改成 0.5 回写，光标被打断，用户永远输不进小于下限的数。
 * 因此输入过程中只更新草稿并向外发值，失焦时才把草稿归一成最终值。
 */
const text = ref(String(props.modelValue));
const focused = ref(false);

watch(
  () => props.modelValue,
  (v) => {
    if (!focused.value) text.value = String(v);
  },
);

function onInput(e: Event) {
  const raw = (e.target as HTMLInputElement).value;
  text.value = raw;
  if (raw.trim() === '') return; // 清空属于输入中间态，等 blur 兜底
  const n = Number(raw);
  if (Number.isFinite(n)) emit('update:modelValue', clamp(n));
}

function onBlur() {
  focused.value = false;
  const raw = text.value.trim();
  const n = Number(raw);
  // 空串 / NaN（type=number 下的非法输入）回退到当前值，避免留下空框
  const v = raw === '' || !Number.isFinite(n) ? clamp(props.modelValue) : clamp(n);
  text.value = String(v);
  if (v !== props.modelValue) emit('update:modelValue', v);
}

const btnSize = computed(() =>
  props.size === 'lg' ? 'w-11 h-11' : props.size === 'sm' ? 'w-8 h-8' : 'w-9 h-9',
);
const iconSize = computed(() => (props.size === 'lg' ? 'icon-md' : 'icon-sm'));
const inputSize = computed(() => (props.size === 'lg' ? 'text-[16px]' : 'text-[15px]'));
</script>

<template>
  <div class="flex items-center gap-2 w-full">
    <button
      type="button"
      class="relative flex-none rounded-md border border-line-strong bg-card text-ink-1 cursor-pointer flex items-center justify-center before:absolute before:content-[''] before:-inset-2 disabled:opacity-40"
      :class="btnSize"
      :disabled="modelValue <= lower"
      :aria-label="`减少 ${stepValue}`"
      @click="set(modelValue - stepValue)"
    >
      <svg class="icon" :class="iconSize" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" aria-hidden="true">
        <line x1="5.5" y1="12" x2="18.5" y2="12" />
      </svg>
    </button>

    <input
      :id="inputId"
      :value="text"
      type="number"
      :step="stepValue"
      :min="lower"
      :max="max"
      inputmode="decimal"
      class="flex-1 min-w-0 text-center font-medium text-ink-1 bg-transparent border-0 p-0 focus:outline-none"
      :class="inputSize"
      :aria-label="ariaLabel"
      @focus="focused = true"
      @input="onInput"
      @blur="onBlur"
    />

    <span v-if="unit" class="flex-none text-[14px] text-ink-2">{{ unit }}</span>

    <button
      type="button"
      class="relative flex-none rounded-md border border-line-strong bg-card text-ink-1 cursor-pointer flex items-center justify-center before:absolute before:content-[''] before:-inset-2 disabled:opacity-40"
      :class="btnSize"
      :disabled="modelValue >= max"
      :aria-label="`增加 ${stepValue}`"
      @click="set(modelValue + stepValue)"
    >
      <svg class="icon" :class="iconSize" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" aria-hidden="true">
        <line x1="12" y1="5.5" x2="12" y2="18.5" />
        <line x1="5.5" y1="12" x2="18.5" y2="12" />
      </svg>
    </button>
  </div>
</template>
