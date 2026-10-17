<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useItemsStore } from '@/stores/items';
import { useLocationsStore } from '@/stores/locations';
import { useDictStore } from '@/stores/dict';
import { inboundDefaults } from '@/domain/inbound';
import { foodKeyOf } from '@/data/dict';
import { computeExpiry, expiryPreviewText } from '@/domain/shelfLife';
import { fallbackDays } from '@/domain/categories';
import { todayStr } from '@/domain/dates';
import { normalizePrice, priceFromInput, round2 } from '@/domain/price';
import { fmtQty } from '@/domain/quantity';
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
  (e: 'inbound', quantity: number, locationId: string, price: number | null): void;
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
/**
 * 单价（元 / 单位）。预填「上次买这个的价格」，可改。
 * `null` = 没填 —— 与 `0` 区分开，统计里「没填价」不能被当成「免费」。
 */
const price = ref<number | null>(null);

watch(
  () => props.item.id,
  () => {
    const d = defaults.value;
    qty.value = d.quantity;
    locId.value = d.locationId;
    price.value = d.price;
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
  return expiryPreviewText(props.item.name, r, { envLabel: ENV_MAP[loc.env].label });
});

/**
 * 合计 = 数量 × 单价。
 *
 * 这一行不只是方便 —— 它是对「把整盒总价当成单价填进来」最直接的提醒：
 * 20 个鸡蛋填 30 会立刻显示「合计 ¥600」，比填完再发现金额虚高好得多。
 */
const totalHint = computed(() => {
  const p = normalizePrice(price.value);
  if (p === null) return '未填价';
  return `合计 ¥${round2(p * qty.value).toFixed(2)}`;
});

function submit() {
  if (!canSubmit.value || !locId.value) return;
  emit('inbound', qty.value, locId.value, normalizePrice(price.value));
}
</script>

<template>
  <!-- 已入库：折叠成一行结果 + 撤销入口，让用户随时能查「到底入库了没」 -->
  <div v-if="inbound" class="mt-2 text-[12px] text-ink-2 flex items-center justify-between gap-2">
    <span class="truncate">已入库 · {{ fmtQty(qty) }}{{ item.unit }} · {{ locations.byId(locId ?? '')?.name ?? '' }}</span>
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
        <svg class="icon icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" aria-hidden="true"><line x1="5.5" y1="12" x2="18.5" y2="12" /></svg>
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
        <svg class="icon icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" aria-hidden="true"><line x1="12" y1="5.5" x2="12" y2="18.5" /><line x1="5.5" y1="12" x2="18.5" y2="12" /></svg>
      </button>
      <span class="text-[12px] text-ink-2 flex-none">{{ item.unit || '个' }}</span>
    </div>

    <!--
      单价是**每 1 单位**的价格，不是整份总价。右侧实时算「合计 = 数量 × 单价」兜住这个歧义。
      口径走 `priceFromInput`：负数会污染月度统计，`1e999` 会变 `Infinity`。
    -->
    <div class="flex items-center gap-2 mb-2.5">
      <label class="text-[12px] text-ink-2 w-9 flex-none" for="sir-price">单价</label>
      <input
        id="sir-price"
        :value="price ?? ''"
        type="number"
        step="0.01"
        min="0"
        inputmode="decimal"
        class="flex-1 min-w-0 h-9 text-center text-[14px] font-medium text-ink-1 bg-card border border-line rounded-md px-2 focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-50"
        :placeholder="`元 / ${item.unit || '个'}`"
        :aria-label="`单价，元每${item.unit || '个'}`"
        @input="price = priceFromInput(($event.target as HTMLInputElement).value)"
      />
      <span class="text-[12px] text-ink-3 flex-none whitespace-nowrap">{{ totalHint }}</span>
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
      >入库 {{ fmtQty(qty) }}{{ item.unit || '个' }}</button>
      <button
        type="button"
        class="flex-1 inline-flex items-center justify-center gap-1 border border-line-strong bg-card rounded-md text-[13px] text-ink-2 cursor-pointer min-h-11"
        @click="emit('dismiss')"
      >下次再说</button>
    </div>
  </div>
</template>
