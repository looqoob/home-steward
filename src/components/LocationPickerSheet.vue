<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { useLocationsStore } from '@/stores/locations';
import { useDictStore } from '@/stores/dict';
import { fallbackDays } from '@/domain/categories';
import { computeExpiry, expiryPreviewText } from '@/domain/shelfLife';
import { todayStr } from '@/domain/dates';
import { ENV_MAP } from '@/domain/types';

const props = defineProps<{
  modelValue: boolean;
  /** 被移动的物品名，用于在弹层里说明在动什么 */
  itemName?: string | null;
  /** 数量，> 1 时提示会重算多件物品的到期日 */
  count?: number;
  /** 已选中的位置 id（打开时回显） */
  selected?: string | null;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void;
  (e: 'confirm', locationId: string): void;
}>();

const locations = useLocationsStore();
const dict = useDictStore();

const picked = ref<string | null>(null);
const confirmBtn = ref<HTMLButtonElement | null>(null);

const enabled = computed(() => locations.enabled);

/**
 * 到期日预览。
 *
 * 换位置会**重算到期日**，这是这个弹层最该说清的后果（用户可能只是想把东西挪个地方，
 * 没想到保质期会变）。预览用该位置**多数派的环境**近似 —— 精确到每件物品的差异
 * 在这里过细，真实差异会在执行后由库存页展示。
 */
const preview = computed(() => {
  if (!picked.value || !props.itemName) return '';
  const loc = locations.byId(picked.value);
  if (!loc) return '';
  const r = computeExpiry(
    { name: props.itemName, category: null, storedAt: todayStr(), producedAt: null, manualShelfLife: null },
    loc.env,
    dict.resolve,
    fallbackDays,
  );
  return expiryPreviewText(loc.name, r, { unsetText: '不计入保质期' });
});

function cancel() {
  emit('update:modelValue', false);
}

function confirm() {
  // 顺序要紧：先 confirm 再关闭，反了父级会先清掉 picked
  if (picked.value) emit('confirm', picked.value);
  emit('update:modelValue', false);
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') cancel();
}

watch(
  () => props.modelValue,
  async (open) => {
    if (open) {
      picked.value = props.selected ?? enabled.value[0]?.id ?? null;
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
  <div v-if="modelValue">
    <div class="absolute inset-0 bg-mask z-28" @click="cancel"></div>
    <div
      class="absolute left-0 right-0 bottom-0 bg-card rounded-t-3xl pt-2 px-4 pb-[calc(20px+env(safe-area-inset-bottom,0px))] z-29 max-h-[86%] overflow-y-auto overscroll-contain no-scrollbar"
      role="dialog"
      aria-modal="true"
      aria-label="选择存放位置"
    >
      <div class="w-9 h-1 rounded-full bg-line-strong mx-auto mb-3"></div>
      <h3 class="text-[16px] font-semibold mb-1">移到哪个位置</h3>
      <p class="text-[12px] text-ink-2 mb-3.5 leading-relaxed">
        <template v-if="count && count > 1">将移动 {{ count }} 件物品，</template>换位置会按新环境重算到期日。
      </p>

      <div v-if="enabled.length === 0" class="text-[13px] text-ink-3 py-6 text-center">
        还没有启用的位置，请先到「位置管理」启用一个。
      </div>

      <div v-else class="flex gap-1.5 flex-wrap mb-3.5">
        <button
          v-for="l in enabled"
          :key="l.id"
          type="button"
          class="inline-flex items-center gap-1.5 whitespace-nowrap text-[13px] border rounded-full px-3 py-1.5 cursor-pointer min-h-10"
          :class="picked === l.id
            ? 'bg-primary-600 border-primary-600 text-white font-medium'
            : 'bg-card border-line text-ink-2'"
          @click="picked = l.id"
        >
          <span class="w-1.5 h-1.5 rounded-full block flex-none" :style="{ background: ENV_MAP[l.env].color }"></span>{{ l.name }}
        </button>
      </div>

      <div v-if="preview" class="text-[12px] text-ink-2 bg-sunken rounded-md p-2.5 mb-3.5 leading-relaxed">
        {{ preview }}
      </div>

      <div class="flex gap-2">
        <van-button class="flex-1" @click="cancel">取消</van-button>
        <van-button
          v-if="enabled.length > 0"
          ref="confirmBtn"
          class="flex-1"
          type="primary"
          @click="confirm"
        >移到此处</van-button>
      </div>
    </div>
  </div>
</template>
