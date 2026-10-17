<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import NavBar from '@/components/NavBar.vue';
import ConfirmSheet from '@/components/ConfirmSheet.vue';
import { useItemsStore } from '@/stores/items';
import { useLocationsStore } from '@/stores/locations';
import { useDictStore } from '@/stores/dict';
import { useShoppingStore } from '@/stores/shopping';
import { useSettingsStore } from '@/stores/settings';
import { useBarcodesStore } from '@/stores/barcodes';
import { buildBackup, backupToJson, backupFileName, downloadJson, copyToClipboard } from '@/data/backup/export';
import { parseBackup, importBackup, type ImportMode } from '@/data/backup/import';
import { useToast } from '@/composables/useToast';
import { formatMD, fromEpoch } from '@/domain/dates';

const router = useRouter();
const items = useItemsStore();
const locations = useLocationsStore();
const dict = useDictStore();
const shopping = useShoppingStore();
const settings = useSettingsStore();
const barcodes = useBarcodesStore();
const { show } = useToast();

const mode = ref<ImportMode>('merge');
const fileInput = ref<HTMLInputElement | null>(null);

/** 由可见按钮代理触发隐藏的文件选择器，保证键盘可操作 */
function pickFile() {
  fileInput.value?.click();
}

/**
 * 上次备份时间。
 *
 * ⚠️ 「下载」与「复制 JSON」是两条独立的导出路径，原生 WebView 里常常只有后者可用
 * （`downloadJson` 会返回 false）。两条路径都必须记 `lastBackupAt`，
 * 只记一条会出现「明明导出了还在提醒未备份」的假提醒。
 */
const lastBackupLabel = computed(() => {
  const ts = settings.settings.lastBackupAt;
  if (!ts) return '从未备份';
  const days = Math.floor((Date.now() - ts) / 86400000);
  const d = Math.max(0, days);
  return `${formatMD(fromEpoch(ts))}（${d} 天前）`;
});

async function markExported() {
  await settings.patch({ lastBackupAt: Date.now() });
}

async function exportFile() {
  const b = await buildBackup();
  const json = backupToJson(b);
  const ok = downloadJson(backupFileName(), json);
  if (!ok) {
    // 环境不支持下载：已落到剪贴板，同样算一次成功导出
    const copied = await copyToClipboard(json);
    show(copied ? '当前环境不支持下载，已复制 JSON 到剪贴板' : '导出失败');
    if (copied) await markExported();
    return;
  }
  await markExported();
  show('已导出备份文件');
}

async function copyJson() {
  const b = await buildBackup();
  const ok = await copyToClipboard(backupToJson(b));
  show(ok ? '已复制 JSON 到剪贴板' : '复制失败');
  if (ok) await markExported();
}

async function reloadStores() {
  await Promise.all([
    items.load(),
    locations.load(),
    dict.load(),
    shopping.load(),
    settings.load(),
    // 条码映射是 v2 新增的独立表，导入后不刷新的话管理页会显示旧数据
    barcodes.load(),
  ]);
}

const confirmImport = ref(false);
const pendingFile = ref<File | null>(null);

async function runImport(f: File) {
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
      let msg = c ? `${res.message}（物品${c.items} 位置${c.locations} 日志${c.logs}）` : res.message;
      // 清洗了脏数据必须说出来：静默丢记录会让用户以为导入很完美，
      // 等发现少了几件时已经无从查证（数据只在本机，没有第二份可以对比）。
      const s = res.sanitized;
      if (s && (s.dropped > 0 || s.fixed > 0)) {
        const parts: string[] = [];
        if (s.dropped > 0) parts.push(`丢弃 ${s.dropped} 条无法识别的记录`);
        if (s.fixed > 0) parts.push(`修正 ${s.fixed} 条异常字段`);
        msg += `；${parts.join('，')}`;
      }
      // 提示时长随内容长度调整：太长的文案在 Toast 里只显示 2.2s，读不完就没了
      show(msg, msg.length > 40 ? 6000 : 2200);
    } else {
      show(res.message);
    }
  } catch (err) {
    show(`读取失败：${(err as Error).message}`);
  }
}

/**
 * 选完文件先判断模式：「覆盖」会先清空本机，**必须**二次确认；「合并」直接执行。
 * 立即清空 input.value 以便重复选择同一文件 —— File 引用本身仍然有效。
 */
async function onFile(e: Event) {
  const input = e.target as HTMLInputElement;
  const f = input.files?.[0];
  if (!f) return;
  input.value = '';
  if (mode.value === 'replace') {
    pendingFile.value = f;
    confirmImport.value = true;
    return;
  }
  await runImport(f);
}

async function doImport() {
  const f = pendingFile.value;
  pendingFile.value = null;
  if (f) await runImport(f);
}
</script>

<template>
  <div class="flex flex-col bg-page h-full w-full max-w-[480px] mx-auto relative overflow-hidden">
    <NavBar title="数据备份" show-back @back="router.back()" />

    <div class="flex-1 overflow-y-auto px-4 pt-4 pb-2 no-scrollbar overscroll-contain">
      <div class="tip mb-3.5">
        所有数据仅存本机。导出为 JSON 文件可备份或迁移；导入可选择「合并」或「覆盖」。建议每次大改前导出一份。
      </div>

      <div class="flex items-center justify-between card px-3 py-2.5 mb-3.5">
        <span class="text-[12px] text-ink-2">上次备份</span>
        <span class="text-[13px] text-ink-1">{{ lastBackupLabel }}</span>
      </div>

      <div class="section-label">导出</div>
      <van-button block type="primary" class="mb-2" @click="exportFile">导出 JSON（下载）</van-button>
      <van-button block class="mb-3.5" @click="copyJson">复制 JSON 到剪贴板</van-button>

      <div class="section-label">导入</div>
      <div class="flex gap-1.5 mb-3">
        <button
          type="button"
          class="inline-flex items-center whitespace-nowrap text-[13px] border rounded-full px-3 py-1.5 cursor-pointer min-h-10"
          :class="mode === 'merge'
            ? 'bg-primary-600 border-primary-600 text-white font-medium'
            : 'bg-card border-line text-ink-2 hover:border-line-strong'"
          @click="mode = 'merge'"
        >合并</button>
        <button
          type="button"
          class="inline-flex items-center whitespace-nowrap text-[13px] border rounded-full px-3 py-1.5 cursor-pointer min-h-10"
          :class="mode === 'replace'
            ? 'bg-primary-600 border-primary-600 text-white font-medium'
            : 'bg-card border-line text-ink-2 hover:border-line-strong'"
          @click="mode = 'replace'"
        >覆盖</button>
      </div>
      <div class="tip mb-3.5">
        合并：按 id 取较新版本；覆盖：先清空本机再写入。
      </div>
      <!--
        不用 <label> 包裹 display:none 的 input：那样键盘无法聚焦触发。
        改为可见 button 触发 + 视觉隐藏的 input（tabindex=-1 避免与按钮重复朗读）。
      -->
      <van-button block class="mb-3.5" @click="pickFile">选择备份文件并导入</van-button>
      <input
        ref="fileInput"
        type="file"
        accept="application/json,.json"
        class="sr-only"
        tabindex="-1"
        aria-hidden="true"
        @change="onFile"
      />

      <div class="tip mt-4">
        导入后本页会自动刷新各模块内存数据。若提示文件无效，请确认是从本应用导出的备份。
      </div>

      <ConfirmSheet
        v-model="confirmImport"
        title="覆盖导入"
        :message="pendingFile ? `将用「${pendingFile.name}」的内容替换本机全部数据，现有物品、位置、日志、清单与字典都会被清空。建议先导出一份当前数据。` : ''"
        confirm-text="覆盖导入"
        danger
        @confirm="doImport"
      />
    </div>
  </div>
</template>
