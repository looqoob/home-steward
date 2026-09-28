<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import NavBar from '@/components/NavBar.vue';
import { useLocationsStore } from '@/stores/locations';
import { useItemsStore } from '@/stores/items';
import { ENV_LIST, ENV_MAP, type EnvType } from '@/domain/types';
import { useToast } from '@/composables/useToast';

const router = useRouter();
const locations = useLocationsStore();
const items = useItemsStore();
const { show } = useToast();

const ICONS = ['冷', '冻', '储', '米', '篮', '阳', '柜', '箱', '盒', '瓶', '袋', '架'];

const creating = ref(false);
const form = ref({ name: '', icon: '储', env: 'cool' as EnvType });

const list = computed(() => locations.all);

function countOf(id: string) {
  return locations.countOf(id, items.list);
}

async function move(id: string, dir: -1 | 1) {
  await locations.move(id, dir);
}

async function toggle(id: string) {
  await locations.toggle(id);
}

async function remove(id: string) {
  const res = await locations.remove(id, items.list);
  if (!res.ok) {
    show(res.message);
    return;
  }
  show('已删除位置');
}

function startCreate() {
  form.value = { name: '', icon: '储', env: 'cool' };
  creating.value = true;
}

async function submitCreate() {
  const name = form.value.name.trim();
  if (!name) {
    show('请填写位置名称');
    return;
  }
  await locations.create({ name, icon: form.value.icon, env: form.value.env });
  creating.value = false;
  show('已新建位置');
}
</script>

<template>
  <div class="screen">
    <NavBar title="位置管理" show-back @back="router.back()" />

    <div class="body">
      <div class="section-title">
        <span>共 {{ list.length }} 个位置</span>
        <button class="link-btn" @click="startCreate">＋ 新建</button>
      </div>

      <div v-if="creating" class="panel" style="padding: 16px">
        <div class="field">
          <label>名称（≤6 字）</label>
          <input v-model="form.name" class="input" maxlength="6" placeholder="如 酒柜" />
        </div>
        <div class="field">
          <label>图标</label>
          <div class="icon-pick">
            <button
              v-for="c in ICONS"
              :key="c"
              :class="{ on: form.icon === c }"
              @click="form.icon = c"
            >{{ c }}</button>
          </div>
        </div>
        <div class="field">
          <label>环境类型</label>
          <div class="wrap-seg">
            <button
              v-for="e in ENV_LIST"
              :key="e.key"
              :class="{ on: form.env === e.key }"
              @click="form.env = e.key"
            >{{ e.label }}</button>
          </div>
        </div>
        <div style="display: flex; gap: 8px">
          <button class="btn btn-ghost" style="flex: 1" @click="creating = false">取消</button>
          <button class="btn btn-primary" style="flex: 1" @click="submitCreate">保存</button>
        </div>
      </div>

      <div
        v-for="(l, idx) in list"
        :key="l.id"
        class="pos-row"
        :class="{ off: !l.enabled }"
      >
        <div class="drag" aria-hidden="true">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.6" /><circle cx="15" cy="6" r="1.6" /><circle cx="9" cy="12" r="1.6" /><circle cx="15" cy="12" r="1.6" /><circle cx="9" cy="18" r="1.6" /><circle cx="15" cy="18" r="1.6" /></svg>
        </div>
        <div class="ic">{{ l.icon }}</div>
        <div class="meta">
          <div class="n">{{ l.name }}<span v-if="l.builtin" style="font-size: 11px; color: var(--text-3); margin-left: 4px">预设</span></div>
          <div class="e">{{ ENV_MAP[l.env].fullLabel }} · 在库 {{ countOf(l.id) }} 件</div>
        </div>
        <button
          class="icon-btn"
          :disabled="idx === 0"
          aria-label="上移"
          @click="move(l.id, -1)"
        >↑</button>
        <button
          class="icon-btn"
          :disabled="idx === list.length - 1"
          aria-label="下移"
          @click="move(l.id, 1)"
        >↓</button>
        <div
          class="switch"
          :class="{ on: l.enabled }"
          role="switch"
          :aria-checked="l.enabled"
          @click="toggle(l.id)"
        ></div>
        <button
          class="icon-btn"
          :disabled="countOf(l.id) > 0"
          aria-label="删除"
          title="有在库物品时不能删除"
          @click="remove(l.id)"
        >🗑</button>
      </div>

      <div class="note" style="margin-top: 12px">
        停用后仍保留物品数据，只是不显示在筛选与录入中；有在库物品的位置需先移出或停用才能删除。
      </div>
    </div>
  </div>
</template>

<style scoped>
.link-btn {
  background: none;
  border: none;
  color: var(--primary-600);
  font-size: 13px;
  cursor: pointer;
}
</style>
