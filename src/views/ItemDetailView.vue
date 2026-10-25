<script setup lang="ts">
/**
 * 物品详情页（v1.1 F20）：**消费视角**的物品落地页。
 *
 * 背景：此前所有「点进某个物品」的路径（通知直达、卡片点击）都落在编辑表单上——
 * 用户只想知道「还剩几天、在哪、怎么处理」，看到的却是一张待填写的表格。
 * 本页回答三个问题：它现在怎么样（状态 + 到期日随手校准）、怎么处理（快捷消耗）、
 * 它经历过什么（消耗记录）；「改信息」退居右上角编辑按钮（/item/:id/edit）。
 *
 * 到期日校准与入库/编辑同口径：指定日期经 `items.calibrateExpiry` 换算为
 * 手填保质期天数（换位置不被字典覆盖），自动保存并给撤销。
 */
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import PageShell from '@/components/PageShell.vue';
import FreshnessBadge from '@/components/FreshnessBadge.vue';
import EnvDotLabel from '@/components/EnvDotLabel.vue';
import ExpiryEditRow from '@/components/ExpiryEditRow.vue';
import ConsumeSheet from '@/components/ConsumeSheet.vue';
import ConfirmSheet from '@/components/ConfirmSheet.vue';
import EmptyState from '@/components/EmptyState.vue';
import GroupHead from '@/components/GroupHead.vue';
import { useItemsStore } from '@/stores/items';
import { useLocationsStore } from '@/stores/locations';
import { useDictStore } from '@/stores/dict';
import { useSettingsStore } from '@/stores/settings';
import { useToday } from '@/composables/useNow';
import { useConsumeFlow } from '@/composables/useConsumeFlow';
import { useToast } from '@/composables/useToast';
import { addDays, formatMD, fromEpoch } from '@/domain/dates';
import { computeExpiry } from '@/domain/shelfLife';
import { fallbackDays } from '@/domain/categories';
import { freshnessOf } from '@/domain/freshness';
import { fmtQty } from '@/domain/quantity';
import { unitPriceText } from '@/domain/price';
import { isEmojiIcon } from '@/domain/itemFactory';
import { ENV_MAP } from '@/domain/types';

const route = useRoute();
const router = useRouter();
const items = useItemsStore();
const locations = useLocationsStore();
const dict = useDictStore();
const settings = useSettingsStore();
const today = useToday();
const { show } = useToast();

/** /item/:id 的参数段；/item/new 是静态路由（→ 编辑页），不会落到本页 */
const id = computed(() => route.params.id as string);
const item = computed(() => (id.value ? items.byId(id.value) : undefined));
const loc = computed(() => (item.value ? locations.byId(item.value.locationId) : undefined));

/** 「现在怎么样」：与列表/组卡同一套口径（freshnessOf），不另立标准 */
const fresh = computed(() =>
  item.value
    ? freshnessOf(item.value, today.value, settings.settings)
    : null,
);

/** 不含手填的推算结果——校准行的「自动预览」一侧 */
const autoExpiry = computed(() => {
  if (!item.value || !loc.value) return null;
  return computeExpiry(
    {
      name: item.value.name,
      category: item.value.category,
      storedAt: item.value.storedAt,
      producedAt: item.value.producedAt,
      manualShelfLife: null,
    },
    loc.value.env,
    dict.resolve,
    fallbackDays,
  );
});

const expiryHint = computed(() => {
  const r = autoExpiry.value;
  if (!r) return '';
  if (r.notRecommended) return `不建议存放（${r.reason}）`;
  if (!r.expireAt || !r.days) return '未设置保质期，可手动指定';
  return `按 ${r.days} 天推算`;
});

/** 手填天数的日期形态（与 ItemEditView 同一套双向换算） */
const pickedExpiry = computed<string | null>({
  get() {
    const i = item.value;
    if (!i || !i.manualShelfLife) return null;
    return addDays(i.producedAt || i.storedAt, i.manualShelfLife);
  },
  set(date) {
    if (!item.value) return;
    void applyCalibration(date);
  },
});

/** 校准 / 恢复自动，自动保存 + 可撤销（calibrateExpiry 返回校准前的手填值作快照） */
async function applyCalibration(date: string | null) {
  const i = item.value;
  if (!i) return;
  const snap = await items.calibrateExpiry(i.id, date);
  if (snap === undefined) return;
  show(date ? '已按包装日期校准' : '已恢复自动推算', 2200, {
    text: '撤销',
    run: () => items.calibrateExpiry(i.id, null, snap),
  });
}

/* ==================== 快捷消耗 ==================== */

/** 单件消耗动线与列表同源（useConsumeFlow）：≤1 直执行、>1 弹层问数量 */
const { target: consumeTarget, ask: askConsume, confirm: confirmConsume } = useConsumeFlow();

/** 该物品的消耗记录（最新在前，最多 10 条） */
const history = computed(() =>
  item.value
    ? items.logs
        .filter((l) => l.itemId === item.value!.id && !l.deletedAt)
        .sort((a, b) => b.at - a.at)
        .slice(0, 10)
    : [],
);

/** 已用完 / 已删除的物品不再给消耗按钮（byId 会滤掉已删除，这里只挡 finished） */
const consumable = computed(() => item.value?.status === 'in_stock');

/* ==================== 删除 ==================== */

const confirmRemove = ref(false);

/** 「明天再说」：延后的是待办，不是到期日（与待办区同一动作） */
async function snoozeTomorrow() {
  const i = item.value;
  if (!i) return;
  await items.snooze(i.id, 1);
  show('已延后到明天', 1800, { text: '撤销', run: () => items.unsnooze(i.id) });
}

async function removeItem() {
  const i = item.value;
  if (!i) return;
  const snapshot = await items.remove(i.id);
  show('已删除', 2200, snapshot ? { text: '撤销', run: () => items.restore(snapshot) } : undefined);
  router.back();
}

function goEdit() {
  router.push(`/item/${id.value}/edit`);
}

function goStock() {
  router.push('/stock');
}
</script>

<template>
  <PageShell :title="item?.name || '物资详情'">
    <EmptyState v-if="!item" text="该物资不存在或已删除">
      <template #icon>?</template>
      <template #action>
        <van-button type="primary" @click="goStock">回库存看看</van-button>
      </template>
    </EmptyState>

    <template v-else-if="item && fresh">
      <!-- ① 状态卡：一眼回答「它现在怎么样」 -->
      <div class="card p-4 mb-3">
        <div class="flex items-start gap-3">
          <span class="w-12 h-12 rounded-md flex-none flex items-center justify-center text-[18px] font-medium text-primary-700 bg-primary-50">
            {{ isEmojiIcon(item.icon) ? item.icon : item.icon.slice(0, 1) }}
          </span>
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 min-w-0">
              <span class="text-[17px] font-semibold text-ink-1 truncate">{{ item.name }}</span>
              <FreshnessBadge :state="fresh.state" :label="fresh.label" />
            </div>
            <div class="text-[12px] text-ink-3 mt-1 flex items-center gap-2 flex-wrap">
              <span>{{ fmtQty(item.quantity) }}{{ item.unit }}</span>
              <span v-if="unitPriceText(item.price, item.unit)" class="tabular-nums">{{ unitPriceText(item.price, item.unit) }}</span>
              <EnvDotLabel
                v-if="loc"
                :color="ENV_MAP[loc.env].color"
                :name="loc.name"
              />
            </div>
          </div>
        </div>

        <!-- ② 到期日随手校准（v1.1 F20 痛点 1）：看到包装日期与 App 不符时两秒纠正 -->
        <div class="mt-3 pt-3 border-t border-line">
          <ExpiryEditRow
            v-model="pickedExpiry"
            :auto-expire-at="autoExpiry?.expireAt ?? null"
            :hint="expiryHint"
            :min-date="item.storedAt"
          />
        </div>
      </div>

      <!-- ③ 快捷消耗：处理动作就在状态旁边，不用再找 -->
      <template v-if="consumable">
        <div class="flex gap-2 mb-4">
          <van-button class="flex-1" type="primary" @click="askConsume(item, 'consumed')">用掉</van-button>
          <van-button class="flex-1" type="danger" plain @click="askConsume(item, 'wasted')">扔掉</van-button>
          <!-- 「明天再说」只在需要处理时出现：延后的是待办，不是到期日 -->
          <van-button
            v-if="fresh.state === 'over' || fresh.state === 'urgent'"
            class="flex-none"
            @click="snoozeTomorrow"
          >明天再说</van-button>
        </div>
      </template>
      <div v-else class="tip mb-4">这件物资已处理完，记录保留在消耗明细与统计里。</div>

      <!-- ④ 消耗记录：它经历过什么 -->
      <GroupHead variant="plain" label="消耗记录" :count="history.length" />
      <div v-if="history.length === 0" class="text-[12px] text-ink-3 mb-4">还没有记录。</div>
      <div v-else class="card mb-4 py-0.5">
        <div
          v-for="l in history"
          :key="l.id"
          class="flex items-center justify-between gap-2 px-3.5 py-2.5 border-b border-line last:border-b-0 text-[13px]"
        >
          <span class="min-w-0">
            <span
              class="text-[11px] px-1.5 py-0.5 rounded font-medium mr-2 align-middle"
              :class="l.type === 'consumed' ? 'text-primary-600 bg-primary-50' : 'text-danger bg-danger/10'"
            >{{ l.type === 'consumed' ? '用掉' : '扔掉' }}</span>
            <span class="text-ink-1 tabular-nums">{{ fmtQty(l.quantity) }}{{ l.unit }}</span>
          </span>
          <span class="text-[12px] text-ink-3 flex-none tabular-nums">{{ formatMD(fromEpoch(l.at)) }}</span>
        </div>
      </div>

      <!-- ⑤ 出口：编辑退居次要，删除带确认 -->
      <div class="flex gap-2 mb-3">
        <van-button class="flex-1" @click="goEdit">编辑资料</van-button>
        <van-button class="flex-none" type="danger" plain @click="confirmRemove = true">删除</van-button>
      </div>

      <ConsumeSheet
        :model-value="consumeTarget !== null"
        :item="consumeTarget?.item ?? null"
        :type="consumeTarget?.type ?? 'consumed'"
        @update:model-value="consumeTarget = null"
        @confirm="confirmConsume"
      />

      <ConfirmSheet
        v-model="confirmRemove"
        title="删除物资"
        :message="`「${item.name}」将从库存移除，不计入消耗统计。可在提示中撤销。`"
        confirm-text="删除"
        danger
        @confirm="removeItem"
      />
    </template>
  </PageShell>
</template>
