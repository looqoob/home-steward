import { db } from '../index';
import type { BackupFile } from './schema';
import { SCHEMA_VERSION } from '@/domain/types';
import { todayStr } from '@/domain/dates';

export async function buildBackup(): Promise<BackupFile> {
  const [items, locations, logs, shopping, dict, settings, barcodes, snapshots] = await Promise.all([
    db.items.all(),
    db.locations.all(),
    db.logs.all(),
    db.shopping.all(),
    db.dict.all(),
    db.settings.get(),
    db.barcodes.all(),
    db.snapshots.all(),
  ]);
  return {
    app: 'home-steward',
    // 用常量而不是写死 1：以后再升版时这里自动跟上，漏改会写出"版本号比内容旧"的备份
    version: SCHEMA_VERSION,
    exportedAt: Date.now(),
    items,
    locations,
    logs,
    shopping,
    dict,
    barcodes,
    snapshots,
    settings,
  };
}

export function backupToJson(b: BackupFile): string {
  return JSON.stringify(b, null, 2);
}

export function backupFileName(now: number = Date.now()): string {
  return `home-steward-backup-${todayStr(now)}.json`;
}

/**
 * 触发文本文件下载（`<a download>` + Blob URL）。`downloadJson` 的通用版，
 * 供 CSV 等其它导出复用（v1.1 F2）。原生 WebView 不支持时返回 false，由 UI 提示改用「复制」。
 */
export function downloadText(filename: string, text: string, mime: string): boolean {
  try {
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(url);
      a.remove();
    }, 2000);
    return true;
  } catch {
    return false;
  }
}

/** 触发下载。原生 WebView 不支持时返回 false，由 UI 提示改用「复制 JSON」 */
export function downloadJson(filename: string, json: string): boolean {
  return downloadText(filename, json, 'application/json');
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
