<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { useBarcodesStore } from '@/stores/barcodes';
import { normalizePrice, priceFromInput, round2 } from '@/domain/price';
import { useLocationsStore } from '@/stores/locations';
import { useItemsStore } from '@/stores/items';
import { useDictStore } from '@/stores/dict';
import { fallbackDays } from '@/domain/categories';
import { computeExpiry, expiryPreviewText } from '@/domain/shelfLife';
import { todayStr } from '@/domain/dates';
import { ENV_MAP } from '@/domain/types';
import { useToast } from '@/composables/useToast';
import BottomSheet from '@/components/BottomSheet.vue';
import QtyStepper from '@/components/QtyStepper.vue';
import type { Item } from '@/domain/types';
// 仅类型导入：运行时代码走动态 import，不会让 html5-qrcode 进主包
import type { Html5Qrcode } from 'html5-qrcode';

/**
 * 条码扫描。
 *
 * 隐私与降级：
 * - **纯本地**：只查本机映射表，不联网查任何商品库；
 * - `html5-qrcode` 动态 import，不进主包，首屏体积不受影响；
 * - 摄像头不可用（无权限 / 桌面 WebView）时降级为手输条码数字，不把路堵死。
 */
const props = defineProps<{ modelValue: boolean }>();
const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void;
  (e: 'inbound', item: Item): void;
}>();

const barcodes = useBarcodesStore();
const locations = useLocationsStore();
const items = useItemsStore();
const dict = useDictStore();
const { show } = useToast();

const videoEl = ref<HTMLDivElement | null>(null);
const scanning = ref(false);
/** 摄像头起不来时的降级提示 */
const failed = ref('');
const manualCode = ref('');

/** 首次见到这个条码：让用户教一次 */
const pendingCode = ref<string | null>(null);
const newName = ref('');
const newQty = ref(1);
const newUnit = ref('个');
const newLoc = ref<string | null>(null);
/**
 * 单价（元 / 单位），`null` = 没填价（**不是** 0）。
 *
 * 条码映射是最适合带价格的入口：一个条码往往就是「那款固定规格的商品」，
 * 教一次就知道它大概多少钱，后面每次扫都不用再想。
 */
const newPrice = ref<number | null>(null);

/**
 * 合计 = 数量 × 单价。
 *
 * 与快速入库同一个理由：实时显示能兜住「把整箱总价当成单价填进来」。
 */
const newPriceTotal = computed(() => {
  const p = normalizePrice(newPrice.value);
  return p === null ? '' : `合计 ¥${round2(p * newQty.value).toFixed(2)}`;
});

const UNITS = ['个', '袋', '斤', '瓶', '盒'];

let scanner: Html5Qrcode | null = null;

/**
 * 彻底停掉摄像头。
 *
 * ⚠️ 只调 `scanner.stop()` 是不够的：必须显式 `getTracks().stop()`，
 * 否则摄像灯会一直亮着、持续耗电。这是最容易漏的一步。
 */
async function stopScanner() {
  scanning.value = false;
  try {
    await scanner?.stop();
  } catch {
    /* 已经停了，忽略 */
  }
  try {
    scanner?.clear();
  } catch {
    /* noop */
  }
  scanner = null;
  // 双保险：即便上面的 stop 抛错，也把视频轨停掉
  videoEl.value?.querySelectorAll('video').forEach((v) => {
    // `srcObject` 的类型是 `MediaProvider | Blob | null`，只有 MediaStream 才有 getTracks，
    // 这里做一次窄化判断；html5-qrcode 挂的一定是 MediaStream。
    const stream = v.srcObject;
    if (stream && 'getTracks' in stream) {
      (stream as MediaStream).getTracks().forEach((t: MediaStreamTrack) => t.stop());
    }
    v.srcObject = null;
  });
}

function close() {
  emit('update:modelValue', false);
}

/** 命中本地映射：直接入库 */
async function onScan(code: string) {
  const hit = await barcodes.lookup(code);
  if (!hit) {
    // 未知条码 → 转入「教一次」表单
    pendingCode.value = code;
    newName.value = '';
    newQty.value = 1;
    newUnit.value = '个';
    newLoc.value = locations.enabled[0]?.id ?? null;
    newPrice.value = null;
    return;
  }
  await doInbound(
    hit.name,
    hit.quantity ?? 1,
    hit.unit || '个',
    hit.locationId ?? locations.enabled[0]?.id ?? null,
    hit.price ?? null,
  );
}

async function startScan() {
  failed.value = '';
  await nextTick();
  const el = videoEl.value;
  if (!el) return;
  scanning.value = true;
  try {
    // 动态 import：只有真正打开扫描时才加载这 ~20KB（不进主包，保住首屏体积）
    const mod = await import('html5-qrcode');
    const id = el.id;
    scanner = new mod.Html5Qrcode(id, { verbose: false });
    await scanner.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: { width: 220, height: 140 } },
      (decoded) => {
        void onScan(decoded);
      },
      () => {
        /* 每帧解码失败是正常的（没对准），静默即可 */
      },
    );
  } catch (e) {
    scanning.value = false;
    scanner = null;
    // 不静默失败：给明确原因 + 手动输入的降级入口
    failed.value = `无法启动摄像头：${(e as Error)?.message || '权限被拒绝或设备不支持'}`;
  }
}

/** 映射已有 → 入库 */
async function doInbound(
  name: string,
  quantity: number,
  unit: string,
  locationId: string | null,
  price: number | null = null,
) {
  if (!locationId) {
    show('请先到「位置管理」启用一个位置');
    return;
  }
  const [row] = await items.addMany([{ name, quantity, unit, locationId, price: normalizePrice(price) }]);
  if (!row) return;
  show(`已加入库存：${row.name} ${row.quantity}${row.unit}`, 2200, {
    text: '撤销',
    run: () => items.remove(row.id),
  });
  emit('inbound', row);
  await stopScanner();
  close();
}

/** 首次见到：记住映射并同时入库 */
async function saveNewMapping() {
  const name = newName.value.trim();
  if (!name || !pendingCode.value) return;
  if (!newLoc.value) {
    show('请先到「位置管理」启用一个位置');
    return;
  }
  await barcodes.upsert({
    code: pendingCode.value,
    name,
    quantity: newQty.value,
    unit: newUnit.value,
    locationId: newLoc.value,
    price: newPrice.value,
  });
  await doInbound(name, newQty.value, newUnit.value, newLoc.value, newPrice.value);
}

/** 只记映射不入库 */
async function saveMappingOnly() {
  const name = newName.value.trim();
  if (!name || !pendingCode.value) return;
  // 价格一样要记住：这次不入库，下次扫到就该用得上
  await barcodes.upsert({
    code: pendingCode.value,
    name,
    quantity: newQty.value,
    unit: newUnit.value,
    locationId: newLoc.value,
    price: newPrice.value,
  });
  show(`已记住：${name}`);
  await stopScanner();
  close();
}

/** 降级路径：手输条码数字 */
async function submitManual() {
  const code = manualCode.value.trim();
  if (!code) return;
  manualCode.value = '';
  await onScan(code);
}

const expiryPreview = ref('');

watch([newLoc, newName], () => {
  if (!newLoc.value || !newName.value.trim()) {
    expiryPreview.value = '';
    return;
  }
  const loc = locations.byId(newLoc.value);
  if (!loc) {
    expiryPreview.value = '';
    return;
  }
  const r = computeExpiry(
    { name: newName.value.trim(), category: null, storedAt: todayStr(), producedAt: null, manualShelfLife: null },
    loc.env,
    dict.resolve,
    fallbackDays,
  );
  expiryPreview.value = expiryPreviewText(loc.name, r, { unsetText: '不计入保质期' });
});

watch(
  () => props.modelValue,
  async (open) => {
    if (open) {
      await startScan();
    } else {
      // 关闭时必须停摄像头，否则灯一直亮
      await stopScanner();
      pendingCode.value = null;
      newPrice.value = null;
      failed.value = '';
    }
  },
);

onBeforeUnmount(() => {
  void stopScanner();
});
</script>

<template>
  <BottomSheet
    :model-value="modelValue"
    title="扫码入库"
    aria-label="扫码入库"
    title-spacing="tight"
    @update:model-value="(v) => emit('update:modelValue', v)"
  >
      <p class="text-[12px] text-ink-2 mb-3.5 leading-relaxed">
        条码与名称只保存在本机，不联网查询。首次遇到新条码会让你手动记一次。
      </p>

      <!-- 情况一：首次见到这个条码 -->
      <template v-if="pendingCode">
        <div class="tip mb-3">新条码 {{ pendingCode }}</div>

        <div class="mb-3">
          <label class="block text-[12px] text-ink-2 mb-1.5" for="bc-name">这是什么？</label>
          <input
            id="bc-name"
            v-model="newName"
            class="w-full h-11 border border-line-strong rounded-md px-3 text-[14px] bg-card text-ink-1 placeholder:text-ink-3 focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-50"
            placeholder="如 纯牛奶"
          />
        </div>

        <div class="mb-3">
          <div class="text-[12px] text-ink-2 mb-1.5">数量</div>
          <div class="bg-card border border-line rounded-md px-2.5 py-1.5">
            <QtyStepper v-model="newQty" aria-label="数量" />
          </div>
        </div>

        <div class="mb-3">
          <div class="text-[12px] text-ink-2 mb-1.5">单位</div>
          <div class="flex gap-1.5 flex-wrap">
            <button
              v-for="u in UNITS"
              :key="u"
              type="button"
              class="inline-flex items-center whitespace-nowrap text-[13px] border rounded-full px-3 py-1.5 cursor-pointer min-h-10"
              :class="newUnit === u
                ? 'bg-primary-600 border-primary-600 text-white font-medium'
                : 'bg-card border-line text-ink-2'"
              @click="newUnit = u"
            >{{ u }}</button>
          </div>
        </div>

        <div class="mb-3">
          <div class="text-[12px] text-ink-2 mb-1.5">位置</div>
          <div class="flex gap-1.5 flex-wrap">
            <button
              v-for="l in locations.enabled"
              :key="l.id"
              type="button"
              class="inline-flex items-center gap-1.5 whitespace-nowrap text-[13px] border rounded-full px-3 py-1.5 cursor-pointer min-h-10"
              :class="newLoc === l.id
                ? 'bg-primary-600 border-primary-600 text-white font-medium'
                : 'bg-card border-line text-ink-2'"
              @click="newLoc = l.id"
            >
              <span class="w-1.5 h-1.5 rounded-full block flex-none" :style="{ background: ENV_MAP[l.env].color }"></span>{{ l.name }}
            </button>
          </div>
        </div>

        <!--
          单价：**每 1 单位**的价格（元），不是整份总价。右侧实时算合计兜住这个歧义。
          口径走 `priceFromInput`：负数会污染月度统计，`1e999` 会变 `Infinity`。
        -->
        <div class="mb-3">
          <label class="block text-[12px] text-ink-2 mb-1.5" for="bc-price">单价（元 / {{ newUnit || '个' }}，可选）</label>
          <div class="flex items-center gap-2">
            <input
              id="bc-price"
              :value="newPrice ?? ''"
              type="number"
              step="0.01"
              min="0"
              inputmode="decimal"
              class="flex-1 min-w-0 h-11 border border-line-strong rounded-md px-3 text-[14px] bg-card text-ink-1 placeholder:text-ink-3 focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-50"
              placeholder="如 1.5（不是整箱 30）"
              @input="newPrice = priceFromInput(($event.target as HTMLInputElement).value)"
            />
            <span v-if="newPriceTotal" class="text-[12px] text-ink-3 flex-none whitespace-nowrap">{{ newPriceTotal }}</span>
          </div>
        </div>

        <div v-if="expiryPreview" class="tip mb-3">{{ expiryPreview }}</div>

        <div class="flex flex-col gap-2">
          <van-button block type="primary" :disabled="!newName.trim()" @click="saveNewMapping">记住并入库</van-button>
          <div class="flex gap-2">
            <van-button class="flex-1" :disabled="!newName.trim()" @click="saveMappingOnly">只记名称</van-button>
            <van-button class="flex-1" @click="close">取消</van-button>
          </div>
        </div>
      </template>

      <!-- 情况二：取景中 / 降级 -->
      <template v-else>
        <div v-if="failed" class="tip tip-danger mb-3">
          {{ failed }}。可以改用下方手动输入条码数字。
        </div>

        <div
          v-show="scanning"
          id="bc-scan"
          ref="videoEl"
          class="bg-sunken rounded-md overflow-hidden mb-3"
          style="min-height: 180px"
        ></div>

        <div v-if="scanning" class="text-[12px] text-ink-3 text-center mb-3">对准商品条码</div>

        <div class="mb-2">
          <label class="block text-[12px] text-ink-2 mb-1.5" for="bc-code">手动输入条码</label>
          <div class="flex gap-2">
            <input
              id="bc-code"
              v-model="manualCode"
              class="flex-1 min-w-0 h-11 border border-line-strong rounded-md px-3 text-[14px] bg-card text-ink-1 placeholder:text-ink-3 focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-50"
              placeholder="如 6901234567892"
              @keyup.enter="submitManual"
            />
            <van-button type="primary" class="flex-none" @click="submitManual">查询</van-button>
          </div>
        </div>

        <van-button block plain class="mt-3" @click="close">关闭</van-button>
      </template>
  </BottomSheet>
</template>
