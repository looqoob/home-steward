<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import NavBar from '@/components/NavBar.vue';
import ConfirmSheet from '@/components/ConfirmSheet.vue';
import { useLocationsStore } from '@/stores/locations';
import { useItemsStore } from '@/stores/items';
import { ENV_LIST, ENV_MAP, type EnvType, type Location } from '@/domain/types';
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

const confirmRemove = ref(false);
const pendingRemove = ref<Location | null>(null);

/** 删除位置不可恢复，先弹二次确认（按钮 disabled 只挡住了「有在库物品」这一种情况） */
function askRemove(l: Location) {
  pendingRemove.value = l;
  confirmRemove.value = true;
}

async function remove() {
  const l = pendingRemove.value;
  pendingRemove.value = null;
  if (!l) return;
  const res = await locations.remove(l.id, items.list);
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
  <div class="flex flex-col bg-page h-full w-full max-w-[480px] mx-auto relative overflow-hidden">
    <NavBar title="位置管理" show-back @back="router.back()" />

    <div class="flex-1 overflow-y-auto px-4 pt-4 pb-2 no-scrollbar overscroll-contain">
      <div class="section-label flex justify-between items-center">
        <span>共 {{ list.length }} 个位置</span>
        <button
          type="button"
          class="bg-transparent border-0 text-primary-600 text-[13px] cursor-pointer p-0 inline-flex items-center gap-1"
          @click="startCreate"
        >
          <svg class="icon icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" aria-hidden="true"><line x1="12" y1="5.5" x2="12" y2="18.5" /><line x1="5.5" y1="12" x2="18.5" y2="12" /></svg>
          新建
        </button>
      </div>

      <div v-if="creating" class="card card-lg p-4 mb-3 shadow-card">
        <div class="mb-3.5">
          <label class="block text-[12px] text-ink-2 mb-1.5">名称（≤6 字）</label>
          <input v-model="form.name" maxlength="6" class="w-full h-11 border border-line-strong rounded-md px-3 text-[14px] bg-card text-ink-1 focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-50" placeholder="如 酒柜" />
        </div>
        <div class="mb-3.5">
          <label class="block text-[12px] text-ink-2 mb-1.5">图标</label>
          <div class="grid grid-cols-6 gap-2">
            <button
              v-for="c in ICONS"
              :key="c"
              type="button"
              class="h-10 rounded-md border text-[14px] cursor-pointer"
              :class="form.icon === c
                ? 'border-primary-600 bg-primary-50 text-primary-700'
                : 'border-line bg-card text-ink-2'"
              @click="form.icon = c"
            >{{ c }}</button>
          </div>
        </div>
        <div class="mb-3.5">
          <label class="block text-[12px] text-ink-2 mb-1.5">环境类型</label>
          <div class="flex gap-1.5 flex-wrap">
            <button
              v-for="e in ENV_LIST"
              :key="e.key"
              type="button"
              class="inline-flex items-center whitespace-nowrap text-[13px] border rounded-full px-3 py-1.5 cursor-pointer min-h-10"
              :class="form.env === e.key
                ? 'bg-primary-600 border-primary-600 text-white font-medium'
                : 'bg-card border-line text-ink-2 hover:border-line-strong'"
              @click="form.env = e.key"
            >{{ e.label }}</button>
          </div>
        </div>
        <div class="flex gap-2">
          <van-button class="flex-1" @click="creating = false">取消</van-button>
          <van-button class="flex-1" type="primary" @click="submitCreate">保存</van-button>
        </div>
      </div>

      <div
        v-for="(l, idx) in list"
        :key="l.id"
        class="flex items-center gap-3 card p-3 mb-2 shadow-card transition-transform"
        :class="{ 'opacity-60': !l.enabled }"
      >
        <div class="w-5 text-ink-3 flex-none cursor-grab flex items-center justify-center" aria-hidden="true">
          <svg class="icon icon-sm" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.6" /><circle cx="15" cy="6" r="1.6" /><circle cx="9" cy="12" r="1.6" /><circle cx="15" cy="12" r="1.6" /><circle cx="9" cy="18" r="1.6" /><circle cx="15" cy="18" r="1.6" /></svg>
        </div>
        <div class="w-8 h-8 rounded-md flex-none flex items-center justify-center text-[13px] font-medium text-ink-2 bg-sunken">{{ l.icon }}</div>
        <div class="flex-1 min-w-0">
          <div class="text-[14px] font-medium truncate">
            {{ l.name }}<span v-if="l.builtin" class="text-[12px] text-ink-3 ml-1">预设</span>
          </div>
          <div class="text-[12px] text-ink-3 mt-0.5">{{ ENV_MAP[l.env].fullLabel }} · 在库 {{ countOf(l.id) }} 件</div>
        </div>
        <button
          type="button"
          class="relative w-8 h-8 flex items-center justify-center rounded-md text-ink-3 cursor-pointer disabled:opacity-40 before:absolute before:content-[''] before:-inset-2"
          :disabled="idx === 0"
          aria-label="上移"
          @click="move(l.id, -1)"
        >↑</button>
        <button
          type="button"
          class="relative w-8 h-8 flex items-center justify-center rounded-md text-ink-3 cursor-pointer disabled:opacity-40 before:absolute before:content-[''] before:-inset-2"
          :disabled="idx === list.length - 1"
          aria-label="下移"
          @click="move(l.id, 1)"
        >↓</button>
        <van-switch :model-value="l.enabled" @change="toggle(l.id)" />
        <button
          type="button"
          class="relative w-8 h-8 flex items-center justify-center rounded-md text-ink-3 cursor-pointer disabled:opacity-40 before:absolute before:content-[''] before:-inset-2"
          :disabled="countOf(l.id) > 0"
          aria-label="删除"
          title="有在库物品时不能删除"
          @click="askRemove(l)"
        >
          <!-- 不用 🗑 emoji：它会渲染成彩色图形，和项目的单色图标语言不一致 -->
          <svg class="icon icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M3 6h18" />
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
            <path d="M10 11v6M14 11v6" />
            <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
          </svg>
        </button>
      </div>

      <div class="tip mt-3">
        停用后仍保留物品数据，只是不显示在筛选与录入中；有在库物品的位置需先移出或停用才能删除。
      </div>

      <ConfirmSheet
        v-model="confirmRemove"
        title="删除位置"
        :message="pendingRemove ? `「${pendingRemove.name}」将被永久删除，此操作不可撤销。已停用的位置建议保留。` : ''"
        confirm-text="删除"
        danger
        @confirm="remove"
      />
    </div>
  </div>
</template>
