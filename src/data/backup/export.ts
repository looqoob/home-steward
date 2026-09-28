import { db } from '../index';
import type { BackupFile } from './schema';
import { todayStr } from '@/domain/dates';

export async function buildBackup(): Promise<BackupFile> {
  const [items, locations, logs, shopping, dict, settings] = await Promise.all([
    db.items.all(),
    db.locations.all(),
    db.logs.all(),
    db.shopping.all(),
    db.dict.all(),
    db.settings.get(),
  ]);
  return {
    app: 'home-steward',
    version: 1,
    exportedAt: Date.now(),
    items,
    locations,
    logs,
    shopping,
    dict,
    settings,
  };
}

export function backupToJson(b: BackupFile): string {
  return JSON.stringify(b, null, 2);
}

export function backupFileName(now: number = Date.now()): string {
  return `home-steward-backup-${todayStr(now)}.json`;
}

/** 触发下载。原生 WebView 不支持时返回 false，由 UI 提示改用「复制 JSON」 */
export function downloadJson(filename: string, json: string): boolean {
  try {
    const blob = new Blob([json], { type: 'application/json' });
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

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
