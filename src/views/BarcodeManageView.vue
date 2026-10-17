<script setup lang="ts">
import { computed, ref } from 'vue';
import PageShell from '@/components/PageShell.vue';
import ConfirmSheet from '@/components/ConfirmSheet.vue';
import FormField from '@/components/FormField.vue';
import EmptyState from '@/components/EmptyState.vue';
import { useBarcodesStore } from '@/stores/barcodes';
import { useToast } from '@/composables/useToast';
import type { BarcodeEntry } from '@/domain/types';

const barcodes = useBarcodesStore();
const { show } = useToast();

/**
 * 条码映射管理。
 *
 * 必须有这个出口：扫描时教错的映射要能改能删，否则用户只能带着一条错误数据用下去。
 */
const editing = ref<BarcodeEntry | null>(null);
const editName = ref('');
const confirmDelete = ref<BarcodeEntry | null>(null);

const list = computed(() => barcodes.list);

function startEdit(b: BarcodeEntry) {
  editing.value = b;
  editName.value = b.name;
}

async function saveEdit() {
  const b = editing.value;
  const name = editName.value.trim();
  if (!b || !name) return;
  await barcodes.update(b.id, { name });
  editing.value = null;
  show('已更新');
}

async function doDelete() {
  const b = confirmDelete.value;
  confirmDelete.value = null;
  if (!b) return;
  await barcodes.remove(b.id);
  show('已删除');
}
</script>

<template>
  <PageShell title="条码映射">
    <div class="tip mb-3.5">
      扫码入库时，条码只会匹配这里记录的名称。映射<strong>只存在本机</strong>，不联网查询任何商品库。
    </div>

    <EmptyState v-if="list.length === 0">
      <template #icon>
        <svg class="icon icon-ill" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
          <path d="M3 5v14M7 5v14M11 5v10M15 5v14M19 5v14" />
        </svg>
      </template>
      还没有条码映射。<br />在「快速入库」里点「扫码」扫一次就会自动创建。
    </EmptyState>

    <div
      v-for="b in list"
      :key="b.id"
      class="card p-3 mb-2 flex items-center gap-3"
    >
      <div class="flex-1 min-w-0">
        <div class="text-[14px] font-medium truncate text-ink-1">{{ b.name }}</div>
        <div class="text-[12px] text-ink-3 mt-0.5 truncate font-mono">{{ b.code }}</div>
        <div v-if="b.quantity || b.unit" class="text-[12px] text-ink-3 mt-0.5">
          默认 {{ b.quantity ?? 1 }}{{ b.unit || '个' }}
        </div>
      </div>
      <button
        type="button"
        class="flex-none text-[13px] text-primary-700 cursor-pointer min-h-11 px-2"
        @click="startEdit(b)"
      >改名</button>
      <button
        type="button"
        class="flex-none text-[13px] text-danger cursor-pointer min-h-11 px-2"
        @click="confirmDelete = b"
      >删除</button>
    </div>

    <!--
      改名用**行内展开**而不是 fixed 底栏：fixed 在这个 max-w 容器里定位需要额外的
      居中 hack，且会盖住列表。更重要的是行内展开不会「点保存时列表已滚走」，
      避免用户不知道自己在改哪一条。
    -->
    <div
      v-if="editing"
      class="bg-card border border-primary-600 rounded-md p-3 mb-2"
    >
      <div class="text-[12px] text-ink-2 mb-1.5 font-mono">{{ editing.code }}</div>
      <FormField label="新名称" for-id="bc-rename" spacing="tight">
        <input
          id="bc-rename"
          v-model="editName"
          class="field-input"
          @keyup.enter="saveEdit"
        />
      </FormField>
      <div class="flex gap-2">
        <van-button class="flex-1" @click="editing = null">取消</van-button>
        <van-button class="flex-1" type="primary" :disabled="!editName.trim()" @click="saveEdit">保存</van-button>
      </div>
    </div>
  <ConfirmSheet
    :model-value="confirmDelete !== null"
    title="删除条码映射"
    :message="confirmDelete ? `「${confirmDelete.name}」的映射将被删除，之后扫到该条码会重新询问名称。` : ''"
    confirm-text="删除"
    danger
    @update:model-value="confirmDelete = null"
    @confirm="doDelete"
  />
  </PageShell>
</template>
