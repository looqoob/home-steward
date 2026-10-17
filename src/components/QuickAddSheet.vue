<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { QUICK_FOODS } from '@/data/dict/builtin';
import { useItemsStore } from '@/stores/items';
import { useLocationsStore } from '@/stores/locations';
import { useDictStore } from '@/stores/dict';
import { lookupFood } from '@/data/dict';
import { computeExpiry, expiryPreviewText } from '@/domain/shelfLife';
import { fallbackDays } from '@/domain/categories';
import { ENV_MAP } from '@/domain/types';
import { todayStr } from '@/domain/dates';
import { normalizePrice, priceFromInput, round2 } from '@/domain/price';
import { useToast } from '@/composables/useToast';

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
/**
 * 单价（元 / 单位）。快速入库以前**根本没有这个字段**，新建物品的价格恒为 `null`，
 * 于是「浪费金额」统计永远是 0 —— 用户得回头进详情页一件件补，那条路径基本没人走。
 * `null` = 没填价（不是 0）。
 */
const price = ref<number | null>(null);
/** 自定义食材名：与九宫格共用 `selected`，非空时九宫格自动取消高亮 */
const customName = ref('');

const canAdd = computed(() => !!selected.value && !!locId.value);

/**
 * 合计 = 数量 × 单价。
 *
 * 实时显示是为了兜住「把整盒总价当成单价填进来」：20 个鸡蛋填 30 会立刻显示「合计 ¥600」，
 * 比入库后再发现浪费金额虚高好得多。
 */
const priceTotal = computed(() => {
  const p = normalizePrice(price.value);
  return p === null ? '' : `合计 ¥${round2(p * qty.value).toFixed(2)}`;
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

watch(customName, (v) => {
  const n = v.trim();
  if (n) selected.value = n;
});

/** 点九宫格：占用 `selected` 并清空自定义输入，避免两处同时高亮 */
function pickFood(f: string) {
  selected.value = f;
  customName.value = '';
}

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
  return expiryPreviewText(selected.value, r, { envLabel });
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
      locId.value = locations.enabled[0]?.id ?? null;
    }
  },
);

function close() {
  emit('update:modelValue', false);
}

/**
 * 加入库存。
 * @param keepOpen `true` = 连续录入模式：保留已选位置，只重置食材与数量，弹框不关闭。
 */
async function confirm(keepOpen = false) {
  if (!canAdd.value || !selected.value || !locId.value) return;
  await items.add({
    name: selected.value,
    quantity: qty.value,
    unit: unit.value || '个',
    locationId: locId.value,
    price: normalizePrice(price.value),
  });
  show(`已加入：${selected.value}`);
  if (keepOpen) {
    selected.value = null;
    customName.value = '';
    qty.value = 1;
    // 单价也重置：连续录入的是**不同**商品，沿用上一件的价格多半是错的
    price.value = null;
    return;
  }
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
  <div v-if="modelValue">
    <div class="absolute inset-0 bg-mask z-28" @click="close"></div>
    <!--
      弹层 = flex 列：**滚动区**与**操作区**是兄弟，不是父子。

      为什么不用「滚动容器 + sticky 底栏」：sticky 的活动范围被钳制在包含块（内容盒）内，
      容器的 padding-bottom 会让底栏永远差一个 pb 到不了弹层底边，缝隙里能看到滚动中的内容
      （真机还要再叠一层安全区）。拆成两块后，滚动区物理上结束于底栏上沿，
      内容不可能出现在按钮下方，也不依赖 sticky 的浏览器实现细节。
    -->
    <div class="absolute left-0 right-0 bottom-0 bg-card rounded-t-3xl z-29 max-h-[86%] flex flex-col">
      <!-- min-h-0 必须写：否则 flex 子项不会收缩到内容高度以下，滚动条永远不会出现 -->
      <div class="flex-1 min-h-0 overflow-y-auto overscroll-contain no-scrollbar pt-2 px-4">
        <div class="w-9 h-1 rounded-full bg-line-strong mx-auto mb-3"></div>
        <h3 class="text-[16px] font-semibold mb-3.5">快速入库</h3>

        <div v-if="recentNames.length > 0" class="mb-3.5">
          <div class="text-[12px] text-ink-2 mb-1.5">最近入库</div>
          <div class="flex gap-1.5 flex-wrap">
            <button
              v-for="n in recentNames"
              :key="n"
              type="button"
              class="inline-flex items-center whitespace-nowrap text-[13px] border rounded-full px-3 py-1.5 cursor-pointer min-h-10"
              :class="selected === n
                ? 'bg-primary-600 border-primary-600 text-white font-medium'
                : 'bg-card border-line text-ink-2 hover:border-line-strong'"
              @click="pickFood(n)"
            >{{ n }}</button>
          </div>
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
              class="bg-card border border-line rounded-md py-3 px-1 text-center cursor-pointer min-h-[76px] flex flex-col items-center justify-center gap-1.5 transition-colors"
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

        <div class="mb-3.5">
          <label class="block text-[12px] text-ink-2 mb-1.5" for="qa-custom">或输入其它食材</label>
          <input
            id="qa-custom"
            v-model="customName"
            class="w-full h-11 border border-line-strong rounded-md px-3 text-[14px] bg-card text-ink-1 placeholder:text-ink-3 focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-50"
            placeholder="如 鸭血 / 碱水面"
          />
        </div>

        <template v-if="selected">
          <div class="mb-3.5">
            <div class="text-[12px] text-ink-2 mb-1.5">数量 / 单位</div>
            <div class="flex items-center gap-3 bg-card border border-line rounded-md px-2.5 py-1.5">
              <button
                type="button"
                class="relative w-8 h-8 flex-none rounded-md border border-line-strong bg-card text-ink-1 cursor-pointer flex items-center justify-center before:absolute before:content-[''] before:-inset-2"
                aria-label="减少"
                @click="qty = Math.max(0.5, Math.round((qty - 1) * 100) / 100)"
              >
                <svg class="icon icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" aria-hidden="true"><line x1="5.5" y1="12" x2="18.5" y2="12" /></svg>
              </button>
              <input
                v-model.number="qty"
                class="flex-1 min-w-0 text-center text-[15px] font-medium text-ink-1 bg-transparent border-0 p-0 focus:outline-none"
                type="number"
                step="0.5"
                min="0.5"
                aria-label="数量"
              />
              <button
                type="button"
                class="relative w-8 h-8 flex-none rounded-md border border-line-strong bg-card text-ink-1 cursor-pointer flex items-center justify-center before:absolute before:content-[''] before:-inset-2"
                aria-label="增加"
                @click="qty = Math.round((qty + 1) * 100) / 100"
              >
                <svg class="icon icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" aria-hidden="true"><line x1="12" y1="5.5" x2="12" y2="18.5" /><line x1="5.5" y1="12" x2="18.5" y2="12" /></svg>
              </button>
            </div>
            <div class="flex gap-1.5 flex-wrap mt-2">
              <button
                v-for="u in UNITS"
                :key="u"
                type="button"
                class="inline-flex items-center whitespace-nowrap text-[13px] border rounded-full px-3 py-1.5 cursor-pointer min-h-10"
                :class="unit === u
                  ? 'bg-primary-600 border-primary-600 text-white font-medium'
                  : 'bg-card border-line text-ink-2 hover:border-line-strong'"
                @click="unit = u"
              >{{ u }}</button>
            </div>
            <div class="mt-2">
              <label class="block text-[12px] text-ink-2 mb-1.5" for="qa-unit">其它单位</label>
              <input
                id="qa-unit"
                v-model="unit"
                class="w-full h-11 border border-line-strong rounded-md px-3 text-[14px] bg-card text-ink-1 placeholder:text-ink-3 focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-50"
                placeholder="如 把 / 根"
              />
            </div>
          </div>

          <div class="mb-3.5">
            <div class="text-[12px] text-ink-2 mb-1.5">存放位置</div>
            <div class="flex gap-1.5 flex-wrap">
              <button
                v-for="l in locations.enabled"
                :key="l.id"
                type="button"
                class="inline-flex items-center gap-1.5 whitespace-nowrap text-[13px] border rounded-full px-3 py-1.5 cursor-pointer min-h-10"
                :class="locId === l.id
                  ? 'bg-primary-600 border-primary-600 text-white font-medium'
                  : 'bg-card border-line text-ink-2 hover:border-line-strong'"
                @click="locId = l.id"
              >
                <span class="w-1.5 h-1.5 rounded-full block flex-none" :style="{ background: ENV_MAP[l.env].color }"></span>{{ l.name }}
              </button>
              <button
                type="button"
                class="inline-flex items-center gap-1 whitespace-nowrap text-[13px] text-ink-3 bg-transparent border border-dashed border-line rounded-full px-3 py-1.5 cursor-pointer min-h-10"
                @click="goLocations"
              >
                <svg class="icon icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" aria-hidden="true"><line x1="12" y1="5.5" x2="12" y2="18.5" /><line x1="5.5" y1="12" x2="18.5" y2="12" /></svg>
                新位置
              </button>
            </div>
          </div>

          <!--
            单价：**每 1 单位**的价格（元），不是整份总价。右侧实时算合计兜住这个歧义。
            口径走 `priceFromInput`：负数会污染月度统计，`1e999` 会变 `Infinity`。
          -->
          <div class="mb-3.5">
            <label class="block text-[12px] text-ink-2 mb-1.5" for="qa-price">单价（元 / {{ unit || '个' }}，可选）</label>
            <div class="flex items-center gap-2">
              <input
                id="qa-price"
                :value="price ?? ''"
                type="number"
                step="0.01"
                min="0"
                inputmode="decimal"
                class="flex-1 min-w-0 h-11 border border-line-strong rounded-md px-3 text-[14px] bg-card text-ink-1 placeholder:text-ink-3 focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-50"
                placeholder="如 1.5（不是整盒 30）"
                @input="price = priceFromInput(($event.target as HTMLInputElement).value)"
              />
              <span v-if="priceTotal" class="text-[12px] text-ink-3 flex-none whitespace-nowrap">{{ priceTotal }}</span>
            </div>
          </div>

          <div class="text-[12px] text-ink-2 bg-sunken rounded-md p-2.5 mb-3.5 leading-relaxed">{{ note }}</div>
        </template>

      <!-- 关闭滚动区 -->
      </div>

      <!--
        操作区：**普通流元素**，永远停在弹层底部（不是 sticky，不受包含块钳制）。
        bg-card 不透明，滚动中的内容从它上方经过、绝不会透到它下面。
        底部留白 = 20px + 4px + 安全区，与拆结构前一致。
      -->
      <div class="flex-none bg-card px-4 pt-3 pb-[calc(24px+env(safe-area-inset-bottom,0px))] border-t border-line">
        <van-button block type="primary" :disabled="!canAdd" class="mb-2" @click="confirm(true)">
          加入并继续
        </van-button>
        <van-button block :disabled="!canAdd" @click="confirm(false)">
          加入
        </van-button>
      </div>
    </div>
  </div>
</template>
