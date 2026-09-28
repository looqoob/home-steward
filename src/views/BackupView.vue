<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import NavBar from '@/components/NavBar.vue';
import { useItemsStore } from '@/stores/items';
import { useLocationsStore } from '@/stores/locations';
import { useDictStore } from '@/stores/dict';
import { useShoppingStore } from '@/stores/shopping';
import { useSettingsStore } from '@/stores/settings';
import { buildBackup, backupToJson, backupFileName, downloadJson, copyToClipboard } from '@/data/backup/export';
import { parseBackup, importBackup, type ImportMode } from '@/data/backup/import';
import { useToast } from '@/composables/useToast';

const router = useRouter();
const items = useItemsStore();
const locations = useLocationsStore();
const dict = useDictStore();
const shopping = useShoppingStore();
const settings = useSettingsStore();
const { show } = useToast();

const mode = ref<ImportMode>('merge');

async function exportFile() {
  const b = await buildBackup();
  const json = backupToJson(b);
  const ok = downloadJson(backupFileName(), json);
  if (!ok) {
    const copied = await copyToClipboard(json);
    show(copied ? '当前环境不支持下载，已复制 JSON 到剪贴板' : '导出失败');
  } else {
    show('已导出备份文件');
  }
}

async function copyJson() {
  const b = await buildBackup();
  const ok = await copyToClipboard(backupToJson(b));
  show(ok ? '已复制 JSON 到剪贴板' : '复制失败');
}

async function reloadStores() {
  await Promise.all([items.load(), locations.load(), dict.load(), shopping.load(), settings.load()]);
}

async function onFile(e: Event) {
  const input = e.target as HTMLInputElement;
  const f = input.files?.[0];
  if (!f) return;
  try {
    const text = await f.text();
    const parsed = parseBackup(text);
    if (!parsed.ok) {
      show(parsed.message);
      return;
    }
    const res = await importBackup(parsed.data, mode.value);
    if (res.ok) {
      await reloadStores();
      const c = res.counts;
      show(c ? `${res.message}（物品${c.items} 位置${c.locations} 日志${c.logs}）` : res.message);
    } else {
      show(res.message);
    }
  } catch (err) {
    show(`读取失败：${(err as Error).message}`);
  } finally {
    input.value = '';
  }
}
</script>

<template>
  <div class="screen">
    <NavBar title="数据备份" show-back @back="router.back()" />

    <div class="body">
      <div class="note">
        所有数据仅存本机。导出为 JSON 文件可备份或迁移；导入可选择「合并」或「覆盖」。建议每次大改前导出一份。
      </div>

      <div class="section-title"><span>导出</span></div>
      <button class="btn btn-primary" @click="exportFile">导出 JSON（下载）</button>
      <button class="btn btn-ghost" style="margin-top: 8px" @click="copyJson">复制 JSON 到剪贴板</button>

      <div class="section-title"><span>导入</span></div>
      <div class="segment" style="margin-bottom: 12px">
        <button :class="{ on: mode === 'merge' }" @click="mode = 'merge'">合并</button>
        <button :class="{ on: mode === 'replace' }" @click="mode = 'replace'">覆盖</button>
      </div>
      <div class="note" style="margin-bottom: 12px">
        合并：按 id 取较新版本；覆盖：先清空本机再写入。
      </div>
      <label class="btn btn-ghost" style="display: inline-flex; width: 100%">
        选择备份文件并导入
        <input type="file" accept="application/json,.json" style="display: none" @change="onFile" />
      </label>

      <div class="note" style="margin-top: 16px">
        导入后本页会自动刷新各模块内存数据。若提示文件无效，请确认是从本应用导出的备份。
      </div>
    </div>
  </div>
</template>
