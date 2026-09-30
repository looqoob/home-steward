<script setup lang="ts">
import { computed } from 'vue';
import type { Item, Location } from '@/domain/types';
import { ENV_MAP } from '@/domain/types';
import { barColor, freshnessOf } from '@/domain/freshness';
import { useSettingsStore } from '@/stores/settings';
import { todayStr } from '@/domain/dates';

const props = defineProps<{ item: Item; location?: Location }>();
const emit = defineEmits<{
  (e: 'click', item: Item): void;
  (e: 'consume', item: Item, type: 'consumed' | 'wasted'): void;
}>();

const settings = useSettingsStore();
const today = todayStr();

const f = computed(() => freshnessOf(props.item, today, settings.settings));
const env = computed(() => (props.location ? ENV_MAP[props.location.env] : null));
const qty = computed(() => {
  const q = props.item.quantity;
  const s = Number.isInteger(q) ? String(q) : String(Math.round(q * 100) / 100);
  return `${s} ${props.item.unit}`.trim();
});

/** 新鲜度徽标配色（原 .b-fresh 等语义类，改为 Tailwind 工具类映射） */
const badgeColor: Record<string, string> = {
  fresh: 'bg-fresh-bg text-fresh-fg',
  soon: 'bg-soon-bg text-soon-fg',
  urgent: 'bg-urgent-bg text-urgent-fg',
  over: 'bg-over-bg text-over-fg',
  warn: 'bg-sunken text-ink-2',
  none: 'bg-sunken text-ink-2',
};
</script>

<template>
  <article class="bg-card border border-line rounded-md p-3 mb-2.5 shadow-card flex gap-3 items-start cursor-pointer">
    <!--
      整卡主操作用原生 button（自带 Tab 焦点与 Enter/Space 激活）。
      右侧「用掉 / 扔掉」是并列按钮，所以整卡不能再套一层 button（嵌套交互元素非法）。
    -->
    <button
      type="button"
      class="flex-1 min-w-0 flex gap-3 items-start bg-transparent border-0 p-0 text-left text-[14px] text-ink-1 cursor-pointer"
      :aria-label="`${props.item.name}，${qty}，${f.label}`"
      @click="emit('click', props.item)"
    >
      <span class="w-10 h-10 rounded-md flex-none flex items-center justify-center text-[15px] font-medium text-primary-700 bg-primary-50">
        {{ props.item.icon || props.item.name.slice(0, 1) }}
      </span>
      <span class="flex-1 min-w-0 flex flex-col gap-1">
        <span class="flex items-center gap-2 min-w-0">
          <span class="text-[15px] font-medium truncate">{{ props.item.name }}</span>
          <span class="text-[12px] px-2 py-0.5 rounded-full whitespace-nowrap flex-none" :class="badgeColor[f.state]">{{ f.label }}</span>
        </span>
        <span class="flex items-center gap-1.5 text-[12px] text-ink-3 flex-wrap mt-0.5">
          <span>{{ qty }}</span>
          <span v-if="props.location" class="inline-flex items-center gap-1 text-[12px] text-ink-2 bg-sunken px-1.5 py-0.5 rounded">
            <i class="w-1.5 h-1.5 rounded-full block" :style="{ background: env?.color }"></i>{{ props.location.name }}
          </span>
          <span v-if="props.item.notRecommended" class="inline-flex items-center gap-1 text-[12px] text-ink-2 bg-sunken px-1.5 py-0.5 rounded">不建议存放</span>
        </span>
        <span v-if="f.progress !== null" class="block h-1 rounded bg-sunken overflow-hidden mt-1">
          <i class="block h-full rounded" :style="{ width: (f.progress * 100).toFixed(0) + '%', background: barColor(f.state) }"></i>
        </span>
      </span>
    </button>

    <div class="flex gap-2.5 flex-none">
      <button
        type="button"
        class="relative w-9 h-9 rounded-md border border-line-strong bg-card flex items-center justify-center text-[15px] leading-none text-primary-700 hover:bg-sunken before:absolute before:content-[''] before:-inset-2"
        :aria-label="`${props.item.name} 用掉了`"
        title="用掉了"
        @click="emit('consume', props.item, 'consumed')"
      >✓</button>
      <button
        type="button"
        class="relative w-9 h-9 rounded-md border border-line-strong bg-card flex items-center justify-center text-[15px] leading-none text-danger hover:bg-sunken before:absolute before:content-[''] before:-inset-2"
        :aria-label="`${props.item.name} 扔掉了`"
        title="扔掉了"
        @click="emit('consume', props.item, 'wasted')"
      >✕</button>
    </div>
  </article>
</template>
