<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import NavBar from '@/components/NavBar.vue';
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
  <div class="screen">
    <NavBar title="保质期字典" show-back @back="router.back()" />

    <div class="body">
      <div class="section-title"><span>我的自定义</span></div>
      <div v-if="dict.entries.length === 0" class="empty" style="padding: 20px">
        还没有自定义，点击下方添加
      </div>
      <div
        v-for="e in dict.entries"
        :key="e.id"
        class="pos-row"
      >
        <div class="ic">{{ e.displayName.slice(0, 1) }}</div>
        <div class="meta">
          <div class="n">{{ e.displayName }}</div>
          <div class="e">{{ ENV_MAP[e.env].label }} · {{ shelfLifeText(e.days) }}<span v-if="e.reason"> · {{ e.reason }}</span></div>
        </div>
        <button class="icon-btn" aria-label="恢复默认" @click="reset(e)">↺</button>
      </div>

      <div class="section-title"><span>添加 / 覆盖自定义</span></div>
      <div class="panel" style="padding: 16px">
        <div class="field">
          <label>食材名称（可与内置同名以覆盖）</label>
          <input v-model="form.name" class="input" placeholder="如 西红柿" />
        </div>
        <div class="field">
          <label>环境</label>
          <div class="wrap-seg">
            <button
              v-for="e in ENV_LIST"
              :key="e.key"
              :class="{ on: form.env === e.key }"
              @click="form.env = e.key"
            >{{ e.label }}</button>
          </div>
        </div>
        <div class="field">
          <label>保质期（天）</label>
          <input v-model="form.days" type="number" min="1" class="input" placeholder="如 7" />
        </div>
        <div class="field">
          <label>备注（可选，如 不建议原因）</label>
          <input v-model="form.reason" class="input" placeholder="如 冷藏易发芽" />
        </div>
        <button class="btn btn-primary" @click="submitCustom">保存</button>
      </div>

      <div class="section-title"><span>内置参考（{{ allBuiltinFoods().length }} 种）</span></div>
      <div v-for="g in groups" :key="g.cat" class="panel" style="padding: 14px">
        <h3>{{ g.label }}</h3>
        <div
          v-for="f in g.foods"
          :key="f.key"
          style="display: flex; align-items: center; gap: 8px; padding: 6px 0; border-bottom: 1px dashed var(--line); cursor: pointer"
          @click="prefill(f.key)"
        >
          <span style="font-size: 14px; font-weight: 500; min-width: 64px">{{ f.key }}</span>
          <span style="flex: 1; display: flex; flex-wrap: wrap; gap: 6px">
            <span
              v-for="(days, env) in f.envs"
              :key="env"
              class="loc-tag"
            >{{ ENV_MAP[env as EnvType].label }} {{ shelfLifeText(days as number) }}</span>
          </span>
        </div>
      </div>

      <div class="note">点击任意内置食材可快速填到上方表单进行覆盖。字典未覆盖的组合会按品类 / 全局默认值兜底。</div>
    </div>
  </div>
</template>
