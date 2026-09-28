<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import NavBar from '@/components/NavBar.vue';
import { useItemsStore } from '@/stores/items';
import { useLocationsStore } from '@/stores/locations';
import { useDictStore } from '@/stores/dict';
import { lookupFood } from '@/data/dict';
import { computeExpiry, compareLocations } from '@/domain/shelfLife';
import { fallbackDays } from '@/domain/categories';
import { ENV_MAP, type Item } from '@/domain/types';
import { todayStr } from '@/domain/dates';
import { useToast } from '@/composables/useToast';

const route = useRoute();
const router = useRouter();
const items = useItemsStore();
const locations = useLocationsStore();
const dict = useDictStore();
const { show } = useToast();

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
      price: draft.price,
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
      price: draft.price,
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

async function consume(type: 'consumed' | 'wasted') {
  if (!item.value) return;
  await items.consume(item.value.id, type);
  show(type === 'consumed' ? '已记录用掉' : '已记录扔掉');
  router.back();
}

async function removeItem() {
  if (!item.value) return;
  await items.remove(item.value.id);
  show('已删除');
  router.back();
}
</script>

<template>
  <div class="screen">
    <NavBar :title="isNew ? '添加物资' : draft.name || '编辑物资'" show-back @back="router.back()" />

    <div class="body">
      <div v-if="!isNew && !item" class="empty">
        <div class="ic">?</div>
        该物资不存在或已删除
      </div>

      <template v-else>
        <div class="field">
          <label>名称</label>
          <input v-model="draft.name" class="input" placeholder="如 西红柿 / 牛奶" />
        </div>

        <div class="field">
          <label>数量 / 单位</label>
          <div class="stepper">
            <button @click="draft.quantity = Math.max(1, draft.quantity - 1)" aria-label="减少">−</button>
            <span class="val">{{ draft.quantity }}</span>
            <button @click="draft.quantity++" aria-label="增加">＋</button>
          </div>
          <input v-model="draft.unit" class="input" style="margin-top: 8px" placeholder="单位，如 个 / 袋 / 斤" />
        </div>

        <div class="field">
          <label>存放位置（切换即时重算到期日）</label>
          <div class="wrap-seg">
            <button
              v-for="l in locations.all"
              :key="l.id"
              :class="{ on: draft.locationId === l.id }"
              @click="draft.locationId = l.id"
            >
              <i class="pos-dot" :class="ENV_MAP[l.env].dotClass"></i>{{ l.name }}
            </button>
          </div>
        </div>

        <div class="note" :class="{ 'is-warn': currentPreview?.notRecommended }">
          <template v-if="currentPreview?.notRecommended">
            <b>不建议存放：</b>{{ currentPreview.reason }}
          </template>
          <template v-else-if="currentPreview?.expireAt">
            当前位置到期日 <b>{{ currentPreview.expireAt }}</b>（{{ currentPreview.days }} 天）
          </template>
          <template v-else>该位置未设置保质期，可手填。</template>
        </div>

        <div class="section-title">
          <span>各位置到期日预览</span>
        </div>
        <table class="mini">
          <thead>
            <tr><th>位置</th><th>环境</th><th>天数</th><th>到期日</th></tr>
          </thead>
          <tbody>
            <tr
              v-for="row in compareRows"
              :key="row.locationId"
              :class="{ 'is-current': row.locationId === draft.locationId }"
            >
              <td>{{ row.locationName }}</td>
              <td>{{ ENV_MAP[row.env].label }}</td>
              <td>
                <template v-if="row.notRecommended">不建议</template>
                <template v-else-if="row.days">{{ row.days }} 天</template>
                <template v-else>—</template>
              </td>
              <td>
                <template v-if="row.notRecommended">{{ row.reason }}</template>
                <template v-else-if="row.expireAt">{{ row.expireAt }}</template>
                <template v-else>—</template>
              </td>
            </tr>
          </tbody>
        </table>

        <div class="field" style="margin-top: 14px">
          <label>生产日期（可选）</label>
          <input v-model="draft.producedAt" type="date" class="input" style="padding: 0 12px" />
        </div>

        <div class="field">
          <label>手填保质期（天，覆盖自动推算）</label>
          <input
            :value="draft.manualShelfLife ?? ''"
            type="number"
            min="1"
            class="input"
            placeholder="留空则按字典/品类自动推算"
            @input="draft.manualShelfLife = ($event.target as HTMLInputElement).value ? Number(($event.target as HTMLInputElement).value) : null"
          />
        </div>

        <div class="field">
          <label>单价（元，可选）</label>
          <input
            :value="draft.price ?? ''"
            type="number"
            step="0.01"
            min="0"
            class="input"
            placeholder="用于统计浪费金额"
            @input="draft.price = ($event.target as HTMLInputElement).value ? Number(($event.target as HTMLInputElement).value) : null"
          />
        </div>

        <div class="field">
          <label>备注（可选）</label>
          <textarea v-model="draft.note" class="input" placeholder="如 买的第二袋"></textarea>
        </div>

        <div class="note">入库日期：{{ storedAt }}</div>

        <button class="btn btn-primary" @click="save">保存</button>

        <template v-if="!isNew">
          <div class="section-title"><span>处理这件物资</span></div>
          <div style="display: flex; gap: 8px; margin-bottom: 8px">
            <button class="btn btn-ghost" style="flex: 1" @click="consume('consumed')">用掉了</button>
            <button class="btn btn-ghost" style="flex: 1" @click="consume('wasted')">扔掉了</button>
          </div>
          <button class="btn btn-danger" @click="removeItem">删除</button>
        </template>
      </template>
    </div>
  </div>
</template>

<style scoped>
.pos-dot {
  margin-right: 4px;
}
</style>
