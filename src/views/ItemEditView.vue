<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import PageShell from '@/components/PageShell.vue';
import ConfirmSheet from '@/components/ConfirmSheet.vue';
import { useItemsStore } from '@/stores/items';
import { useLocationsStore } from '@/stores/locations';
import { useDictStore } from '@/stores/dict';
import { lookupFood } from '@/data/dict';
import { computeExpiry, compareLocations } from '@/domain/shelfLife';
import { fallbackDays } from '@/domain/categories';
import { ENV_MAP, type Item } from '@/domain/types';
import { todayStr } from '@/domain/dates';
import { normalizePrice, priceFromInput } from '@/domain/price';
import { fmtQty } from '@/domain/quantity';
import { useToast } from '@/composables/useToast';
import QtyStepper from '@/components/QtyStepper.vue';
import FormField from '@/components/FormField.vue';
import Pill from '@/components/Pill.vue';
import PillGroup from '@/components/PillGroup.vue';

const route = useRoute();
const router = useRouter();
const items = useItemsStore();
const locations = useLocationsStore();
const dict = useDictStore();
const { show } = useToast();

/** 常用单位快捷选择；下面的输入框仍可自由填写其它单位（与 QuickAddSheet 同一套） */
const UNITS = ['个', '袋', '斤', '瓶', '盒'];

/** 数量保留 2 位小数：0.5 斤这类值加减后不会浮出 0.30000000000000004（与 domain/price 同一份实现） */

const id = route.params.id as string;
const isNew = id === 'new';
const item = computed(() => (isNew ? undefined : items.byId(id)));

const draft = reactive({
  name: '',
  quantity: 1,
  unit: '个',
  locationId: '',
  price: null as number | null,
  producedAt: null as string | null,
  manualShelfLife: null as number | null,
  note: null as string | null,
});

function init() {
  if (item.value) {
    const i = item.value;
    draft.name = i.name;
    draft.quantity = i.quantity;
    draft.unit = i.unit;
    draft.locationId = i.locationId;
    draft.price = i.price;
    draft.producedAt = i.producedAt;
    draft.manualShelfLife = i.manualShelfLife;
    draft.note = i.note;
  } else {
    draft.name = '';
    draft.quantity = 1;
    draft.unit = '个';
    draft.locationId = locations.enabled[0]?.id ?? locations.all[0]?.id ?? '';
    draft.price = null;
    draft.producedAt = null;
    draft.manualShelfLife = null;
    draft.note = null;
  }
}
init();
watch(() => route.params.id, init);

const baseInput = computed(() => ({
  name: draft.name.trim() || '未命名',
  category: item.value?.category ?? lookupFood(draft.name)?.category ?? null,
  storedAt: item.value?.storedAt ?? todayStr(),
  producedAt: draft.producedAt,
  manualShelfLife: draft.manualShelfLife,
}));

const compareRows = computed(() =>
  compareLocations(baseInput.value, locations.all, dict.resolve, fallbackDays),
);

const currentPreview = computed(() => {
  if (!draft.locationId) return null;
  return computeExpiry(baseInput.value, locations.envOf(draft.locationId), dict.resolve, fallbackDays);
});

const storedAt = computed(() => item.value?.storedAt ?? todayStr());

async function save() {
  const name = draft.name.trim();
  if (!name) {
    show('请填写名称');
    return;
  }
  const env = locations.envOf(draft.locationId);
  const r = computeExpiry(baseInput.value, env, dict.resolve, fallbackDays);
  const patch = {
    expireAt: r.expireAt,
    shelfLifeDays: r.days,
    shelfLifeSource: r.source,
    notRecommended: r.notRecommended,
    notRecommendedReason: r.reason,
  };
  if (isNew) {
    await items.add({
      name,
      quantity: draft.quantity,
      unit: draft.unit || '个',
      locationId: draft.locationId,
      price: normalizePrice(draft.price),
      producedAt: draft.producedAt,
      manualShelfLife: draft.manualShelfLife,
      note: draft.note,
    });
    show('已加入库存');
  } else if (item.value) {
    await items.save({
      ...item.value,
      name,
      quantity: draft.quantity,
      unit: draft.unit || '个',
      price: normalizePrice(draft.price),
      producedAt: draft.producedAt,
      manualShelfLife: draft.manualShelfLife,
      note: draft.note,
      locationId: draft.locationId,
      ...patch,
      updatedAt: Date.now(),
    } as Item);
    show('已保存');
  }
  router.back();
}

/** 详情页也能部分消耗（20 个鸡蛋一次用 2 个）；上限跟着剩余量走 */
const remainQty = computed(() => item.value?.quantity ?? 1);
const consumeQty = ref(1);
watch(remainQty, (r) => {
  consumeQty.value = Math.max(0.5, Math.min(consumeQty.value, r));
});

async function consume(type: 'consumed' | 'wasted') {
  if (!item.value) return;
  const remain = item.value.quantity;
  const qty = Math.min(consumeQty.value, remain);
  const logId = await items.consume(item.value.id, type, qty);
  if (!logId) return;
  const verb = type === 'consumed' ? '用掉' : '扔掉';
  const used = fmtQty(qty);
  show(
    qty >= remain ? `已记录${verb}：${item.value.name}` : `已记录${verb} ${used}${item.value.unit}，剩余 ${remain - qty}`,
    2200,
    { text: '撤销', run: () => items.undoConsume(logId) },
  );
  if (qty >= remain) {
    router.back();
    return;
  }
  // 部分消耗后留在页面：把草稿数量同步成扣减后的值，避免下次保存又写回旧数量
  init();
  consumeQty.value = 1;
}

const confirmRemove = ref(false);
/** 「更多选项」默认折叠：生产日期 / 手填保质期 / 单价 / 备注 都是可选低频项 */
const moreOpen = ref(false);

/** 软删除后由 toast 提供撤销：`remove()` 返回删除前的快照 */
async function removeItem() {
  if (!item.value) return;
  const snapshot = await items.remove(item.value.id);
  show('已删除', 2200, snapshot ? { text: '撤销', run: () => items.restore(snapshot) } : undefined);
  router.back();
}
</script>

<template>
  <PageShell :title="isNew ? '添加物资' : draft.name || '编辑物资'">
    <div v-if="!isNew && !item" class="text-center py-12 px-6 text-[13px] text-ink-3">
      <div class="w-14 h-14 rounded-full bg-sunken flex items-center justify-center mx-auto mb-3 text-ink-3">?</div>
      该物资不存在或已删除
    </div>

    <template v-else>
      <FormField label="名称">
        <input v-model="draft.name" class="field-input" placeholder="如 西红柿 / 牛奶" />
      </FormField>

      <FormField label="数量 / 单位" for-id="item-qty">
        <div class="bg-card border border-line rounded-md px-2.5 py-1.5">
          <QtyStepper
            v-model="draft.quantity"
            input-id="item-qty"
            :unit="draft.unit || '个'"
            aria-label="数量"
          />
        </div>
        <!-- 单位：常用 chips + 自定义，与快速入库（QuickAddSheet）保持同一套交互 -->
        <PillGroup class="mt-2">
          <Pill
            v-for="u in UNITS"
            :key="u"
            :selected="draft.unit === u"
            @click="draft.unit = u"
          >{{ u }}</Pill>
        </PillGroup>
        <input
          v-model="draft.unit"
          class="field-input mt-2"
          placeholder="其它单位，如 把 / 根"
          aria-label="其它单位"
        />
      </FormField>

      <FormField label="存放位置（切换即时重算到期日）">
        <PillGroup>
          <Pill
            v-for="l in locations.all"
            :key="l.id"
            :selected="draft.locationId === l.id"
            :dot-color="ENV_MAP[l.env].color"
            @click="draft.locationId = l.id"
          >{{ l.name }}</Pill>
        </PillGroup>
      </FormField>

      <div
        class="tip mb-3.5"
        :class="currentPreview?.notRecommended ? 'tip-soon' : ''"
      >
        <template v-if="currentPreview?.notRecommended">
          <b class="font-medium">不建议存放：</b>{{ currentPreview.reason }}
        </template>
        <template v-else-if="currentPreview?.expireAt">
          当前位置到期日 <b class="font-medium text-ink-1">{{ currentPreview.expireAt }}</b>（{{ currentPreview.days }} 天）
        </template>
        <template v-else>该位置未设置保质期，可手填。</template>
      </div>

      <div class="section-label">各位置到期日预览</div>
      <table class="w-full text-[12px] border-collapse">
        <thead>
          <tr><th class="text-left text-ink-3 font-normal py-1.5 border-b border-line">位置</th><th class="text-left text-ink-3 font-normal py-1.5 border-b border-line">环境</th><th class="text-left text-ink-3 font-normal py-1.5 border-b border-line">天数</th><th class="text-left text-ink-3 font-normal py-1.5 border-b border-line">到期日</th></tr>
        </thead>
        <tbody>
          <tr
            v-for="row in compareRows"
            :key="row.locationId"
            :class="row.locationId === draft.locationId ? 'text-fresh-fg font-medium' : ''"
          >
            <td class="py-1.5 border-b border-dashed border-line text-ink-1">{{ row.locationName }}</td>
            <td class="py-1.5 border-b border-dashed border-line text-ink-2">{{ ENV_MAP[row.env].label }}</td>
            <td class="py-1.5 border-b border-dashed border-line text-ink-2">
              <template v-if="row.notRecommended">不建议</template>
              <template v-else-if="row.days">{{ row.days }} 天</template>
              <template v-else>—</template>
            </td>
            <td class="py-1.5 border-b border-dashed border-line text-ink-2">
              <template v-if="row.notRecommended">{{ row.reason }}</template>
              <template v-else-if="row.expireAt">{{ row.expireAt }}</template>
              <template v-else>—</template>
            </td>
          </tr>
        </tbody>
      </table>

      <div class="section-label flex justify-between items-center">
        <span>更多选项（可选）</span>
        <button
          type="button"
          class="bg-transparent border-0 text-primary-600 text-[13px] cursor-pointer p-0"
          :aria-expanded="moreOpen"
          @click="moreOpen = !moreOpen"
        >{{ moreOpen ? '收起' : '展开' }}</button>
      </div>

      <div v-show="moreOpen">
        <FormField label="生产日期（可选）">
          <input v-model="draft.producedAt" type="date" class="field-input" />
        </FormField>

        <FormField label="手填保质期（天，覆盖自动推算）">
          <input
            :value="draft.manualShelfLife ?? ''"
            type="number"
            min="1"
            class="field-input"
            placeholder="留空则按字典/品类自动推算"
            @input="draft.manualShelfLife = ($event.target as HTMLInputElement).value ? Number(($event.target as HTMLInputElement).value) : null"
          />
        </FormField>

        <!--
          单价：**每 1 单位**的价格（元）。用它算「本次金额 = 单价 × 消耗数量」。
          ⚠️ 口径必须走 `priceFromInput`：负数会把月度「浪费金额」拉成负数，`1e999` 会让它变 `¥Infinity`，
          而 `min="0"` 只是 HTML 校验、挡不住手输。非法值归一为 `null`（= 没填价，不是 0）。
        -->
        <FormField
          :label="`单价（元 / ${draft.unit || '个'}，可选）`"
          for-id="item-price"
          hint="用于统计浪费金额。整份花了多少钱请除以数量再填。"
        >
          <input
            id="item-price"
            :value="draft.price ?? ''"
            type="number"
            step="0.01"
            min="0"
            inputmode="decimal"
            class="field-input"
            :placeholder="`每 1 ${draft.unit || '个'} 的价格，如 1.5（不是整盒 30）`"
            @input="draft.price = priceFromInput(($event.target as HTMLInputElement).value)"
          />
        </FormField>

        <FormField label="备注（可选）">
          <textarea v-model="draft.note" class="field-textarea" placeholder="如 买的第二袋"></textarea>
        </FormField>
      </div>

      <div class="tip mb-3.5">入库日期：{{ storedAt }}</div>

      <van-button block type="primary" class="mb-2" @click="save">保存</van-button>

      <template v-if="!isNew">
        <div class="section-label">处理这件物资</div>
        <FormField :label="`本次数量（在库 ${remainQty}${draft.unit}）`">
          <div class="bg-card border border-line rounded-md px-2.5 py-1.5">
            <QtyStepper
              v-model="consumeQty"
              size="sm"
              :max="remainQty"
              :aria-label="`本次数量，最多 ${remainQty}`"
            />
          </div>
          <button
            type="button"
            class="bg-transparent border-0 text-primary-600 text-[13px] cursor-pointer p-0 mt-1.5"
            @click="consumeQty = remainQty"
          >全部（{{ remainQty }}{{ draft.unit }}）</button>
        </FormField>
        <div class="flex gap-2 mb-2">
          <van-button class="flex-1" @click="consume('consumed')">
            用掉了{{ consumeQty >= remainQty ? '' : ` ${consumeQty}${draft.unit}` }}
          </van-button>
          <van-button class="flex-1" @click="consume('wasted')">
            扔掉了{{ consumeQty >= remainQty ? '' : ` ${consumeQty}${draft.unit}` }}
          </van-button>
        </div>
        <van-button block plain type="danger" @click="confirmRemove = true">删除</van-button>
        <ConfirmSheet
          v-model="confirmRemove"
          title="删除物资"
          :message="`「${draft.name}」将从库存移除，且不计入消耗统计。`"
          confirm-text="删除"
          danger
          @confirm="removeItem"
        />
      </template>
    </template>
</PageShell>
</template>
