<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { QUICK_FOODS } from '@/data/dict/builtin';
import { useItemsStore } from '@/stores/items';
import { useLocationsStore } from '@/stores/locations';
import { useDictStore } from '@/stores/dict';
import { lookupFood, foodKeyOf } from '@/data/dict';
import { computeExpiry, manualDaysForExpiry } from '@/domain/shelfLife';
import { fallbackDays } from '@/domain/categories';
import { ENV_MAP } from '@/domain/types';
import { fmtMoney, normalizePrice, priceFromInput, round2 } from '@/domain/price';
import { findRecentByName } from '@/domain/inbound';
import { isEmojiIcon } from '@/domain/itemFactory';
import { useToast } from '@/composables/useToast';
import { useToday } from '@/composables/useNow';
import BottomSheet from '@/components/BottomSheet.vue';
import QtyStepper from '@/components/QtyStepper.vue';
import Pill from '@/components/Pill.vue';
import PillGroup from '@/components/PillGroup.vue';
import FormField from '@/components/FormField.vue';
import IconPicker from '@/components/IconPicker.vue';
import ExpiryEditRow from '@/components/ExpiryEditRow.vue';

const props = defineProps<{ modelValue: boolean }>();
const emit = defineEmits<{ (e: 'update:modelValue', v: boolean): void }>();

const router = useRouter();
const items = useItemsStore();
const locations = useLocationsStore();
const dict = useDictStore();
const { show } = useToast();

/** 常用单位快捷选择；下面的输入框仍可自由填写其它单位 */
const UNITS = ['个', '袋', '斤', '瓶', '盒'];

const selected = ref<string | null>(null);
const qty = ref(1);
const unit = ref('个');
const locId = ref<string | null>(null);
const today = useToday();
/**
 * 单价（元 / 单位）。快速入库以前**根本没有这个字段**，新建物品的价格恒为 `null`，
 * 于是「浪费金额」统计永远是 0 —— 用户得回头进详情页一件件补，那条路径基本没人走。
 * `null` = 没填价（不是 0）。
 */
const price = ref<number | null>(null);
/** 自定义图标（v1.1 F5）：null = 默认（名字首字） */
const icon = ref<string | null>(null);
/** 自定义食材名：与九宫格共用 `selected`，非空时九宫格自动取消高亮 */
const customName = ref('');

/** 用户挑过的高频 emoji（从既有物品统计，不新增任何存储） */
const recentIcons = computed(() => {
  const freq = new Map<string, number>();
  for (const i of items.list) {
    if (isEmojiIcon(i.icon)) freq.set(i.icon, (freq.get(i.icon) ?? 0) + 1);
  }
  return [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([e]) => e);
});

const canAdd = computed(() => !!selected.value && !!locId.value);

/**
 * 合计 = 数量 × 单价。
 *
 * 实时显示是为了兜住「把整盒总价当成单价填进来」：20 个鸡蛋填 30 会立刻显示「合计 ¥600」，
 * 比入库后再发现浪费金额虚高好得多。
 */
const priceTotal = computed(() => {
  const p = normalizePrice(price.value);
  return p === null ? '' : `合计 ${fmtMoney(round2(p * qty.value))}`;
});

/** 最近入库过的名称（在库 + 消耗日志），供一键复用，最多 8 个 */
const recentNames = computed(() => {
  const seen: string[] = [];
  const push = (n: string) => {
    const name = n.trim();
    if (name && !seen.includes(name) && seen.length < 8) seen.push(name);
  };
  const live = [...items.list].filter((x) => !x.deletedAt).sort((a, b) => b.createdAt - a.createdAt);
  for (const i of live) push(i.name);
  const logs = [...items.logs].filter((x) => !x.deletedAt).sort((a, b) => b.at - a.at);
  for (const l of logs) push(l.name);
  return seen;
});

watch(customName, (v, old) => {
  const n = v.trim();
  if (n) {
    selected.value = n;
    return;
  }
  // 输入框删光时把「来自输入」的 selected 一起复位（REV-20），否则 canAdd 仍为 true，
  // 「输入『鸭血』再全删」会按『鸭血』入库。
  // ⚠️ 用 old 值判定 selected 的来源：点九宫格（pickFood）也会把 customName 清成 ''，
  // 但那时 selected 是格子名、不等于上一次输入，不该被复位。
  const prevTyped = old.trim();
  if (prevTyped && selected.value === prevTyped) selected.value = null;
});

/**
 * 选了食材后预填单价：从最近一次同名称入库的物品带出，与清单行内入库（ShoppingInboundRow）
 * 走同一套 `findRecentByName` 逻辑，体感对齐。支持别名（西红柿 ↔ 番茄）。
 *
 * `null` = 没买过或上次没填价 —— 不凭空给默认值，用户实际花的钱未必和上次一样。
 */
watch(selected, (name) => {
  if (!name) {
    price.value = null;
    return;
  }
  const prev = findRecentByName(items.list, name, foodKeyOf);
  price.value = prev ? normalizePrice(prev.price) : null;
});

/** 点九宫格：占用 `selected` 并清空自定义输入，避免两处同时高亮 */
function pickFood(f: string) {
  selected.value = f;
  customName.value = '';
}

/**
 * 到期日推算（v1.1 F17）：把原只读 tip 的推算拆成「预览日期 + 无日期说明」，
 * 交给 ExpiryEditRow 呈现为可编辑行。selected / locId 任一变化都会重算。
 */
const expiryCalc = computed(() => {
  if (!selected.value || !locId.value) return null;
  const env = locations.envOf(locId.value);
  return computeExpiry(
    { name: selected.value, category: lookupFood(selected.value)?.category ?? null, storedAt: today.value, producedAt: null },
    env,
    dict.resolve,
    fallbackDays,
  );
});

const expiryHint = computed(() => {
  const r = expiryCalc.value;
  if (!r) return '';
  if (r.notRecommended) return `不建议存放（${r.reason}）`;
  if (!r.expireAt || !r.days) return '未设置保质期，可手动指定';
  const envLabel = ENV_MAP[locations.envOf(locId.value as string)].label;
  return `${envLabel} · 按 ${r.days} 天推算`;
});

/**
 * 用户指定的到期日（null = 跟随自动推算）。
 * ⚠️ 换食材必须清掉：给牛奶选的「三天后」对下一件鸡蛋多半是错的。
 */
const expiryDate = ref<string | null>(null);
watch(selected, () => {
  expiryDate.value = null;
});

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      selected.value = null;
      customName.value = '';
      qty.value = 1;
      unit.value = '个';
      price.value = null;
      icon.value = null;
      expiryDate.value = null;
      locId.value = locations.enabled[0]?.id ?? null;
    }
  },
  // ⚠️ immediate：深链直达 ?quickadd=1 时弹层挂载即打开，不触发 change——
  // 不加的话 locId 恒为 null，到期日行与位置预选全部失效（F17 实测踩到）
  { immediate: true },
);

function close() {
  emit('update:modelValue', false);
}

/** 防连点：`items.add()` 不去重，手机卡顿时双击会建出两条同位置同数量的记录 */
const saving = ref(false);

/**
 * 加入库存。
 * @param keepOpen `true` = 连续录入模式：保留已选位置，只重置食材与数量，弹框不关闭。
 */
async function confirm(keepOpen = false) {
  if (saving.value || !canAdd.value || !selected.value || !locId.value) return;
  saving.value = true;
  try {
    const name = selected.value;
    await items.add({
      name,
      quantity: qty.value,
      unit: unit.value || '个',
      locationId: locId.value,
      price: normalizePrice(price.value),
      icon: icon.value,
      // v1.1 F17：用户指定的到期日换算为手填保质期天数落库（优先级最高、换位置不被字典覆盖）；
      // null = 跟随字典/品类自动推算。基准是 storedAt（快速入库 storedAt = 今天，无生产日）。
      manualShelfLife: expiryDate.value ? manualDaysForExpiry(expiryDate.value, today.value) : undefined,
    });
    show(`已加入：${name}`);
    if (keepOpen) {
      selected.value = null;
      customName.value = '';
      qty.value = 1;
      // 单价也重置：连续录入的是**不同**商品，沿用上一件的价格多半是错的
      price.value = null;
      // 图标同理：下一件是别的东西
      icon.value = null;
      return;
    }
    close();
  } finally {
    saving.value = false;
  }
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

/**
 * 打开扫码。
 *
 * 用 `router.replace` 关掉 `?quickadd=1` 这条历史记录：返回时不会回到带 query 的页面
 * 导致快速入库弹框又弹出来（与 `goCustom` / `goLocations` 同一个理由）。
 */
function openScan() {
  router.replace({ path: '/stock', query: { scan: '1' } });
}
</script>

<template>
  <BottomSheet
    :model-value="modelValue"
    title="快速入库"
    fixed-footer
    @update:model-value="(v) => emit('update:modelValue', v)"
  >
        <div v-if="recentNames.length > 0" class="mb-3.5">
          <div class="text-[12px] text-ink-2 mb-1.5">最近入库</div>
          <PillGroup>
            <Pill
              v-for="n in recentNames"
              :key="n"
              :selected="selected === n"
              @click="pickFood(n)"
            >{{ n }}</Pill>
          </PillGroup>
        </div>

        <div class="mb-3.5">
          <div class="text-[12px] text-ink-2 mb-1.5">选食材</div>
          <!--
            九宫格固定 QUICK_FOODS 9 项 = 3 行，天然放得下，**不要**给这一层加 max-h / overflow：
            之前的 max-h-[248px] 比 3 行实际高度（约 254px）小，会在格子内部挤出一点点滚动条，
            鼠标/手指一划就整块跟着动。要滚也由弹框本身（外层 max-h-[86%]）承担。
          -->
          <div class="grid grid-cols-3 gap-2.5">
            <button
              v-for="f in QUICK_FOODS"
              :key="f"
              type="button"
              class="card py-3 px-1 text-center cursor-pointer min-h-[76px] flex flex-col items-center justify-center gap-1.5 transition-colors"
              :class="{ 'border-primary-600 bg-primary-50 ring-2 ring-primary-100': selected === f }"
              @click="pickFood(f)"
            >
              <span class="w-8 h-8 rounded-full bg-primary-50 text-primary-700 flex items-center justify-center text-[14px] font-medium">{{ f.slice(0, 1) }}</span>
              <span class="text-[12px] text-ink-1">{{ f }}</span>
            </button>
          </div>
        </div>

        <!-- 扫码与「自定义食材」并列：都是「想记点什么但不想手打」的入口 -->
        <div class="flex gap-2 mb-3.5">
          <van-button class="flex-1" @click="openScan">
            <span class="inline-flex items-center gap-1.5">
              <svg class="icon icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" aria-hidden="true">
                <path d="M3 5v14M7 5v14M11 5v10M15 5v14M19 5v14" />
              </svg>
              扫码入库
            </span>
          </van-button>
          <van-button class="flex-1" @click="goCustom">
            <span class="inline-flex items-center gap-1.5">
              <svg class="icon icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" aria-hidden="true"><line x1="12" y1="5.5" x2="12" y2="18.5" /><line x1="5.5" y1="12" x2="18.5" y2="12" /></svg>
              自定义食材
            </span>
          </van-button>
        </div>

        <FormField label="或输入其它食材" for-id="qa-custom">
          <input
            id="qa-custom"
            v-model="customName"
            class="field-input"
            placeholder="如 鸭血 / 碱水面"
          />
        </FormField>

        <template v-if="selected">
          <!-- v1.1 F5：图标（可选）。不选就用名字首字，选过的 emoji 会进「你的常用」 -->
          <div class="mb-3.5">
            <div class="text-[12px] text-ink-2 mb-1.5">图标（可选，默认用名字首字）</div>
            <IconPicker v-model="icon" :recent="recentIcons" />
          </div>

          <div class="mb-3.5">
            <div class="text-[12px] text-ink-2 mb-1.5">数量 / 单位</div>
            <div class="bg-card border border-line rounded-md px-2.5 py-1.5">
              <QtyStepper v-model="qty" size="sm" aria-label="数量" />
            </div>
            <PillGroup class="mt-2">
              <Pill
                v-for="u in UNITS"
                :key="u"
                :selected="unit === u"
                @click="unit = u"
              >{{ u }}</Pill>
            </PillGroup>
            <div class="mt-2">
              <label class="field-label" for="qa-unit">其它单位</label>
              <input
                id="qa-unit"
                v-model="unit"
                class="field-input"
                placeholder="如 把 / 根"
              />
            </div>
          </div>

          <div class="mb-3.5">
            <div class="text-[12px] text-ink-2 mb-1.5">存放位置</div>
            <PillGroup>
              <Pill
                v-for="l in locations.enabled"
                :key="l.id"
                :selected="locId === l.id"
                :dot-color="ENV_MAP[l.env].color"
                @click="locId = l.id"
              >{{ l.name }}</Pill>
              <!-- 「新位置」是动作入口，不是选项：虚线边框 + 无 aria-pressed -->
              <button
                type="button"
                class="inline-flex items-center gap-1 whitespace-nowrap text-[13px] text-ink-3 bg-transparent border border-dashed border-line rounded-full px-3 py-1.5 cursor-pointer min-h-10"
                @click="goLocations"
              >
                <svg class="icon icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" aria-hidden="true"><line x1="12" y1="5.5" x2="12" y2="18.5" /><line x1="5.5" y1="12" x2="18.5" y2="12" /></svg>
                新位置
              </button>
            </PillGroup>
          </div>

          <!-- v1.1 F17：到期日可编辑行（默认自动推算，点「修改」指定日期） -->
          <div v-if="selected && locId" class="mb-3.5">
            <ExpiryEditRow
              v-model="expiryDate"
              :auto-expire-at="expiryCalc?.expireAt ?? null"
              :hint="expiryHint"
            />
          </div>

          <!--
            单价：**每 1 单位**的价格（元），不是整份总价。右侧实时算合计兜住这个歧义。
            口径走 `priceFromInput`：负数会污染月度统计，`1e999` 会变 `Infinity`。
          -->
          <FormField :label="`单价（元 / ${unit || '个'}，可选）`" for-id="qa-price">
            <div class="flex items-center gap-2">
              <input
                id="qa-price"
                :value="price ?? ''"
                type="number"
                step="0.01"
                min="0"
                inputmode="decimal"
                class="field-input flex-1 min-w-0"
                placeholder="如 1.5（不是整盒 30）"
                @input="price = priceFromInput(($event.target as HTMLInputElement).value)"
              />
              <span v-if="priceTotal" class="text-[12px] text-ink-3 flex-none whitespace-nowrap">{{ priceTotal }}</span>
            </div>
          </FormField>
        </template>

    <template #footer>
      <!--
        v1.1 F15-11：主副按钮同行。「加入并继续 / 加入」两个全宽按钮上下摞着，
        文案只差两字、90% 场景只点一个——「仅此一件」降为边框副按钮放右侧，
        语义差异（要不要再填下一件）一目了然。
      -->
      <div class="flex gap-2">
        <van-button class="flex-1" type="primary" :disabled="!canAdd || saving" @click="confirm(true)">
          加入并继续
        </van-button>
        <van-button class="flex-none px-4" :disabled="!canAdd || saving" @click="confirm(false)">
          仅此一件
        </van-button>
      </div>
    </template>
  </BottomSheet>
</template>
