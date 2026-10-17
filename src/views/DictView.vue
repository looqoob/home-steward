<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import NavBar from '@/components/NavBar.vue';
import Pill from '@/components/Pill.vue';
import PillGroup from '@/components/PillGroup.vue';
import FormField from '@/components/FormField.vue';
import { useDictStore } from '@/stores/dict';
import { allBuiltinFoods, shelfLifeText } from '@/data/dict';
import { BUILTIN_FOODS } from '@/data/dict/builtin';
import { ENV_LIST, CATEGORY_LABEL, ENV_MAP, type EnvType } from '@/domain/types';
import { useToast } from '@/composables/useToast';

const router = useRouter();
const dict = useDictStore();
const { show } = useToast();

const groups = computed(() => {
  const map = new Map<string, (typeof BUILTIN_FOODS)[number][]>();
  for (const f of allBuiltinFoods()) {
    const arr = map.get(f.category) ?? [];
    arr.push(f);
    map.set(f.category, arr);
  }
  return Array.from(map.entries()).map(([cat, foods]) => ({
    cat,
    label: CATEGORY_LABEL[cat as keyof typeof CATEGORY_LABEL],
    foods,
  }));
});

const form = ref({ name: '', env: 'chilled' as EnvType, days: '', reason: '' });

function prefill(name: string) {
  form.value.name = name;
  window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
}

async function submitCustom() {
  const name = form.value.name.trim();
  if (!name) {
    show('请填写食材名称');
    return;
  }
  const raw = form.value.days.trim();
  const days = Number(raw);
  if (!raw || !Number.isFinite(days) || days <= 0) {
    show('天数需为正数');
    return;
  }
  await dict.upsert(name, name, form.value.env, days, form.value.reason.trim() || null);
  form.value = { name: '', env: 'chilled', days: '', reason: '' };
  show('已保存自定义（优先于内置）');
}

async function reset(entry: { dictKey: string; env: EnvType }) {
  await dict.reset(entry.dictKey, entry.env);
  show('已恢复为内置默认');
}
</script>

<template>
  <div class="flex flex-col bg-page h-full w-full max-w-[480px] mx-auto relative overflow-hidden">
    <NavBar title="保质期字典" show-back @back="router.back()" />

    <div class="flex-1 overflow-y-auto px-4 pt-4 pb-2 no-scrollbar overscroll-contain">
      <div class="section-label">我的自定义</div>
      <div v-if="dict.entries.length === 0" class="text-center py-5 px-5 text-[13px] text-ink-3">还没有自定义，点击下方添加</div>
      <div
        v-for="e in dict.entries"
        :key="e.id"
        class="flex items-center gap-3 card p-3 mb-2 shadow-card"
      >
        <div class="w-8 h-8 rounded-md flex-none flex items-center justify-center text-[13px] font-medium text-ink-2 bg-sunken">{{ e.displayName.slice(0, 1) }}</div>
        <div class="flex-1 min-w-0">
          <div class="text-[14px] font-medium">{{ e.displayName }}</div>
          <div class="text-[12px] text-ink-3 mt-0.5">{{ ENV_MAP[e.env].label }} · {{ shelfLifeText(e.days) }}<span v-if="e.reason"> · {{ e.reason }}</span></div>
        </div>
        <button class="relative w-8 h-8 flex items-center justify-center rounded-md text-ink-3 cursor-pointer before:absolute before:content-[''] before:-inset-2" aria-label="恢复默认" @click="reset(e)">↺</button>
      </div>

      <div class="section-label">添加 / 覆盖自定义</div>
      <div class="card card-lg p-4 mb-3 shadow-card">
        <FormField label="食材名称" for-id="dict-name">
          <input
            id="dict-name"
            v-model="form.name"
            class="field-input"
            placeholder="如 西红柿"
          />
        </FormField>
        <FormField label="环境">
          <PillGroup>
            <Pill
              v-for="e in ENV_LIST"
              :key="e.key"
              :selected="form.env === e.key"
              @click="form.env = e.key"
            >{{ e.label }}</Pill>
          </PillGroup>
        </FormField>
        <FormField label="保质期（天）" for-id="dict-days">
          <input
            id="dict-days"
            v-model="form.days"
            type="number"
            min="1"
            class="field-input"
            placeholder="如 7"
          />
        </FormField>
        <FormField label="备注" for-id="dict-reason">
          <input
            id="dict-reason"
            v-model="form.reason"
            class="field-input"
            placeholder="如 冷藏易发芽"
          />
        </FormField>
        <van-button block type="primary" @click="submitCustom">保存</van-button>
      </div>

      <div class="section-label">内置参考（{{ allBuiltinFoods().length }} 种）</div>
      <div v-for="g in groups" :key="g.cat" class="card card-lg p-3.5 mb-3 shadow-card">
        <h3 class="text-[13px] font-semibold mb-3.5">{{ g.label }}</h3>
        <div
          v-for="f in g.foods"
          class="flex items-center gap-2 py-1.5 border-b border-dashed border-line cursor-pointer"
          @click="prefill(f.key)"
        >
          <span class="text-[14px] font-medium min-w-[64px] max-w-[96px] truncate">{{ f.key }}</span>
          <span class="flex-1 flex flex-wrap gap-1.5">
            <span
              v-for="(days, env) in f.envs"
              :key="env"
              class="inline-flex items-center text-[12px] text-ink-2 bg-sunken px-1.5 py-0.5 rounded"
            >{{ ENV_MAP[env as EnvType].label }} {{ shelfLifeText(days as number) }}</span>
          </span>
        </div>
      </div>

      <div class="tip">
        点击任意内置食材可快速填到上方表单进行覆盖。字典未覆盖的组合会按品类 / 全局默认值兜底。
      </div>
    </div>
  </div>
</template>
