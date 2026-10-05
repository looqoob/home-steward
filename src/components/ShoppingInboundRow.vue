<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useItemsStore } from '@/stores/items';
import { useLocationsStore } from '@/stores/locations';
import { useDictStore } from '@/stores/dict';
import { inboundDefaults } from '@/domain/inbound';
import { foodKeyOf } from '@/data/dict';
import { computeExpiry } from '@/domain/shelfLife';
import { fallbackDays } from '@/domain/categories';
import { todayStr } from '@/domain/dates';
import { ENV_MAP, type ShoppingItem } from '@/domain/types';

/**
 * 清单项的行内入库卡。
 *
 * 为什么是**行内展开**而不是弹层：超市回来一路走一路放，每件弹一次遮罩会累到不想用。
 * 行内展开可以连续处理，整张清单始终可见。
 */
const props = defineProps<{
  item: ShoppingItem;
  /** 已入库时展示结果行（此时不再展开表单） */
  inbound: boolean;
}>();

const emit = defineEmits<{
  (e: 'inbound', quantity: number, locationId: string): void;
  (e: 'dismiss'): void;
  (e: 'undo'): void;
}>();

const items = useItemsStore();
const locations = useLocationsStore();
const dict = useDictStore();

/** 打开时按「清单项自带值 → 上次同名称历史 → 默认」预填（见 domain/inbound） */
// 传别名解析器：「西红柿」也能命中历史里的「番茄」，与 stores/shopping 用同一个 foodKeyOf
const defaults = computed(() => inboundDefaults(props.item, items.list, locations.all, foodKeyOf));

const qty = ref(1);
const locId = ref<string | null>(null);

watch(
  () => props.item.id,
  () => {
    const d = defaults.value;
    qty.value = d.quantity;
    locId.value = d.locationId;
  },
  { immediate: true },
);

const enabled = computed(() => locations.enabled);
const canSubmit = computed(() => locId.value !== null && qty.value > 0);

/** 到期日预览：与快速入库（QuickAddSheet）用同一套推算，措辞也保持一致 */
const preview = computed(() => {
  if (!locId.value) return '';
  const loc = locations.byId(locId.value);
  if (!loc) return '';
  const r = computeExpiry(
    { name: props.item.name, category: null, storedAt: todayStr(), producedAt: null, manualShelfLife: null },
    loc.env,
    dict.resolve,
    fallbackDays,
  );
  const envLabel = ENV_MAP[loc.env].label;
  if (r.notRecommended) return `${props.item.name} · ${envLabel} · 不建议存放（${r.reason}）`;
  if (!r.expireAt) return `${props.item.name} · ${envLabel} · 未设置保质期（可到编辑页手填）`;
  return `${props.item.name} · ${envLabel} · ${r.days} 天，到期日 ${r.expireAt.slice(5)}`;
});

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}

function submit() {
  if (!canSubmit.value || !locId.value) return;
  emit('inbound', qty.value, locId.value);
}
</script>

<template>
  <!-- 已入库：折叠成一行结果 + 撤销入口，让用户随时能查「到底入库了没」 -->
  <div v-if="inbound" class="mt-2 text-[12px] text-ink-2 flex items-center justify-between gap-2">
    <span class="truncate">已入库 · {{ fmt(qty) }}{{ item.unit }} · {{ locations.byId(locId ?? '')?.name ?? '' }}</span>
    <button type="button" class="text-primary-700 cursor-pointer flex-none" @click="emit('undo')">撤销入库</button>
  </div>

  <div v-else class="mt-2.5 pt-2.5 border-t border-line">
    <div class="flex items-center gap-2 mb-2.5">
      <span class="text-[12px] text-ink-2 w-9 flex-none">数量</span>
      <button
        type="button"
        class="relative w-9 h-9 flex-none rounded-md border border-line-strong bg-card text-ink-1 cursor-pointer flex items-center justify-center before:absolute before:content-[''] before:-inset-2"
        aria-label="减少"
        @click="qty = Math.max(0.5, Math.round((qty - 0.5) * 100) / 100)"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><line x1="5.5" y1="12" x2="18.5" y2="12" /></svg>
      </button>
      <input
        :value="qty"
        type="number"
        step="0.5"
        min="0.5"
        class="flex-1 min-w-0 text-center text-[15px] font-medium text-ink-1 bg-transparent border-0 p-0 focus:outline-none"
        :aria-label="`数量，最多按 ${item.name} 实际情况`"
        @input="qty = Number(($event.target as HTMLInputElement).value) || 0.5"
      />
      <button
        type="button"
        class="relative w-9 h-9 flex-none rounded-md border border-line-strong bg-card text-ink-1 cursor-pointer flex items-center justify-center before:absolute before:content-[''] before:-inset-2"
        aria-label="增加"
        @click="qty = Math.round((qty + 0.5) * 100) / 100"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><line x1="12" y1="5.5" x2="12" y2="18.5" /><line x1="5.5" y1="12" x2="18.5" y2="12" /></svg>
      </button>
      <span class="text-[12px] text-ink-2 flex-none">{{ item.unit || '个' }}</span>
    </div>

    <div class="flex gap-1.5 flex-wrap mb-2.5">
      <button
        v-for="l in enabled"
        :key="l.id"
        type="button"
        class="inline-flex items-center gap-1.5 whitespace-nowrap text-[13px] border rounded-full px-3 py-1.5 cursor-pointer min-h-10"
        :class="locId === l.id
          ? 'bg-primary-600 border-primary-600 text-white font-medium'
          : 'bg-card border-line text-ink-2'"
        @click="locId = l.id"
      >
        <span class="w-1.5 h-1.5 rounded-full block flex-none" :style="{ background: ENV_MAP[l.env].color }"></span>{{ l.name }}
      </button>
    </div>

    <div v-if="enabled.length === 0" class="text-[12px] text-danger bg-sunken rounded-md p-2.5 mb-2.5 leading-relaxed">
      所有位置都被停用了，请先到「位置管理」启用一个位置再入库。
    </div>
    <div v-else class="text-[12px] text-ink-2 bg-sunken rounded-md p-2.5 mb-2.5 leading-relaxed">{{ preview }}</div>

    <div class="flex gap-2">
      <button
        type="button"
        class="flex-1 inline-flex items-center justify-center gap-1 bg-primary-600 text-white rounded-md text-[13px] cursor-pointer min-h-11 disabled:opacity-40"
        :disabled="!canSubmit"
        @click="submit"
      >入库 {{ fmt(qty) }}{{ item.unit || '个' }}</button>
      <button
        type="button"
        class="flex-1 inline-flex items-center justify-center gap-1 border border-line-strong bg-card rounded-md text-[13px] text-ink-2 cursor-pointer min-h-11"
        @click="emit('dismiss')"
      >下次再说</button>
    </div>
  </div>
</template>
