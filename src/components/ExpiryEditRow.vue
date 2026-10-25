<script setup lang="ts">
/**
 * 到期日行（v1.1 F17 抽公用）：快速入库 / 扫码 / 清单入库卡共用的「预览 + 修改」行。
 *
 * 背景：到期日此前只有**只读预览**（快速入库的 tip、清单入库卡的预览文案，扫码干脆没有），
 * 改日期要入库后进详情、点开折叠、再把日期换算成天数——三重繁琐。
 * 本组件把预览升级为可编辑：默认自动推算（零成本），点「修改」展开快捷胶囊 + 日期选择。
 *
 * 数据口径：用户指定的日期由调用方换算为 `manualShelfLife` 落库
 * （domain/shelfLife.manualDaysForExpiry，基准 producedAt || storedAt）——
 * 本组件只产出日期，不做换算（domain 的事不进组件）。
 *
 * 两种形态：
 * - `view`（默认）：一行预览 + 「修改」文字按钮；
 * - `edit`：快捷胶囊（今天 / 明天 / 3 天 / 一周）+ 日期选择器（min = 今天）+「恢复自动」。
 */
import { computed, ref, watch } from 'vue';
import { addDays, formatMD, todayStr } from '@/domain/dates';

const props = defineProps<{
  /** 自动推算的到期日（computeExpiry 的产物）；null 表示推算不出（未配置保质期 / 不建议环境） */
  autoExpireAt: string | null;
  /** 预览说明（如「冷藏 · 按 7 天推算」）；空则只显示日期 */
  hint?: string;
  /** 用户指定的日期（null = 跟随自动推算） */
  modelValue: string | null;
  /**
   * 日期选择器下限。快速入库等主动线传默认（今天，过去日期无法换算成手填天数）；
   * 编辑页传物品的 storedAt——录入存量时「东西早就过期了」是合法状态。
   */
  minDate?: string;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', v: string | null): void;
}>();

const today = todayStr();
const minDate = computed(() => props.minDate ?? today);
const editing = ref(false);
const draft = ref<string>(props.modelValue ?? props.autoExpireAt ?? today);

watch(
  () => [props.modelValue, props.autoExpireAt] as const,
  ([mv, auto]) => {
    // 外部重置（换位置 / 换食材导致推算变化）时，未指定就跟着预览走
    draft.value = mv ?? auto ?? today;
  },
);

/** 实际生效的日期：用户指定 > 自动推算 */
const effective = computed(() => props.modelValue ?? props.autoExpireAt);

const QUICK: { label: string; date: string }[] = [
  { label: '今天', date: today },
  { label: '明天', date: addDays(today, 1) },
  { label: '3 天', date: addDays(today, 3) },
  { label: '一周', date: addDays(today, 7) },
];

function pick(date: string) {
  draft.value = date;
  emit('update:modelValue', date);
  editing.value = false;
}

/** 「恢复自动」：清掉用户指定，回到推算值 */
function resetAuto() {
  emit('update:modelValue', null);
  editing.value = false;
}

const isModified = computed(() => props.modelValue !== null);
</script>

<template>
  <div>
    <!-- view 形态：一行预览 -->
    <div class="flex items-center justify-between gap-2 min-h-9">
      <span class="text-[13px] text-ink-2 min-w-0 flex items-baseline gap-1.5 flex-wrap">
        <span class="text-ink-1 font-medium">到期日</span>
        <span v-if="effective" class="tabular-nums">{{ formatMD(effective) }}</span>
        <span v-else class="text-ink-3">推算不出，可手动指定</span>
        <span v-if="hint && !isModified" class="text-[12px] text-ink-3">{{ hint }}</span>
        <span v-if="isModified" class="text-[11px] px-1.5 py-0.5 rounded bg-primary-50 text-primary-700 flex-none">手动指定</span>
      </span>
      <button
        type="button"
        class="bg-transparent border-0 text-primary-600 text-[13px] cursor-pointer p-0 flex-none min-h-9"
        :aria-expanded="editing"
        @click="editing = !editing"
      >{{ editing ? '收起' : '修改' }}</button>
    </div>

    <!-- edit 形态：快捷胶囊 + 日期选择 -->
    <div v-if="editing" class="mt-2">
      <div class="flex flex-wrap gap-1.5 mb-2">
        <button
          v-for="q in QUICK"
          :key="q.label"
          type="button"
          class="border text-[13px] px-3 py-1.5 rounded-full cursor-pointer min-h-11"
          :class="draft === q.date ? 'border-primary-600 bg-primary-50 text-primary-700 font-medium' : 'border-line bg-card text-ink-2'"
          @click="pick(q.date)"
        >{{ q.label }}</button>
        <button
          v-if="isModified"
          type="button"
          class="border border-dashed border-line text-[13px] px-3 py-1.5 rounded-full cursor-pointer min-h-11 bg-transparent text-ink-3"
          @click="resetAuto"
        >恢复自动推算</button>
      </div>
      <input
        v-model="draft"
        type="date"
        class="field-input"
        :min="minDate"
        aria-label="到期日"
        @change="pick(draft)"
      />
    </div>
  </div>
</template>
