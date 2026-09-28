<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { QUICK_FOODS } from '@/data/dict/builtin';
import { useItemsStore } from '@/stores/items';
import { useLocationsStore } from '@/stores/locations';
import { useDictStore } from '@/stores/dict';
import { lookupFood } from '@/data/dict';
import { computeExpiry } from '@/domain/shelfLife';
import { fallbackDays } from '@/domain/categories';
import { ENV_MAP } from '@/domain/types';
import { todayStr } from '@/domain/dates';
import { useToast } from '@/composables/useToast';

const props = defineProps<{ modelValue: boolean }>();
const emit = defineEmits<{ (e: 'update:modelValue', v: boolean): void }>();

const router = useRouter();
const items = useItemsStore();
const locations = useLocationsStore();
const dict = useDictStore();
const { show } = useToast();

const selected = ref<string | null>(null);
const qty = ref(1);
const unit = ref('个');
const locId = ref<string | null>(null);

const canAdd = computed(() => !!selected.value && !!locId.value);

const note = computed(() => {
  if (!selected.value || !locId.value) return '';
  const env = locations.envOf(locId.value);
  const r = computeExpiry(
    { name: selected.value, category: lookupFood(selected.value)?.category ?? null, storedAt: todayStr(), producedAt: null },
    env,
    dict.resolve,
    fallbackDays,
  );
  const envLabel = ENV_MAP[env].label;
  if (r.notRecommended) return `${selected.value} · ${envLabel} · 不建议存放（${r.reason}）`;
  if (!r.expireAt) return `${selected.value} · ${envLabel} · 未设置保质期（可到编辑页手填）`;
  return `${selected.value} · ${envLabel} · ${r.days} 天，到期日 ${r.expireAt.slice(5)}`;
});

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      selected.value = null;
      qty.value = 1;
      unit.value = '个';
      locId.value = locations.enabled[0]?.id ?? null;
    }
  },
);

function close() {
  emit('update:modelValue', false);
}

async function confirm() {
  if (!canAdd.value || !selected.value || !locId.value) return;
  await items.add({ name: selected.value, quantity: qty.value, unit: unit.value || '个', locationId: locId.value });
  show(`已加入：${selected.value}`);
  close();
}

/**
 * 这两个跳转用 replace 替换掉「?quickadd=1」这条历史记录：
 * ① 不会再 emit close，避免与父级的 router.back() 抢导航；
 * ② 返回时不会回到带 query 的记录导致弹框又弹出来。
 */
function goCustom() {
  router.replace('/item/new');
}

function goLocations() {
  router.replace('/locations');
}
</script>

<template>
  <div v-if="modelValue" class="quick-add">
    <div class="scrim" @click="close"></div>
    <div class="sheet">
      <div class="grabber"></div>
      <h3>快速入库</h3>

      <div class="field">
        <label>选食材</label>
        <div class="grid9">
          <button
            v-for="f in QUICK_FOODS"
            :key="f"
            class="tile"
            :class="{ on: selected === f }"
            @click="selected = f"
          >
            <span class="ic">{{ f.slice(0, 1) }}</span>
            <span>{{ f }}</span>
          </button>
        </div>
      </div>

      <button class="btn btn-ghost" style="margin-bottom: 14px" @click="goCustom">＋ 自定义食材</button>

      <template v-if="selected">
        <div class="field">
          <label>数量 / 单位</label>
          <div class="stepper">
            <button @click="qty = Math.max(1, qty - 1)" aria-label="减少">−</button>
            <span class="val">{{ qty }}</span>
            <button @click="qty++" aria-label="增加">＋</button>
          </div>
          <input v-model="unit" class="input" style="margin-top: 8px" placeholder="单位，如 个 / 袋 / 斤" />
        </div>

        <div class="field">
          <label>存放位置</label>
          <div class="wrap-seg">
            <button
              v-for="l in locations.enabled"
              :key="l.id"
              :class="{ on: locId === l.id }"
              @click="locId = l.id"
            >
              <i class="pos-dot" :class="ENV_MAP[l.env].dotClass"></i>{{ l.name }}
            </button>
            <button class="add" @click="goLocations">＋新位置</button>
          </div>
        </div>

        <div class="note">{{ note }}</div>
      </template>

      <button class="btn btn-primary" :disabled="!canAdd" @click="confirm">加入库存</button>
    </div>
  </div>
</template>

<style scoped>
.quick-add :deep(.pos-dot) {
  margin-right: 4px;
}
</style>
