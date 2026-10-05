import { db } from '../index';
import type { BackupFile } from './schema';
import { validateBackup } from './schema';
import type { BarcodeEntry, ConsumeLog, DictEntry, Item, Location, ShoppingItem } from '@/domain/types';

export type ImportMode = 'replace' | 'merge';

export interface ImportResult {
  ok: boolean;
  message: string;
  counts?: { items: number; locations: number; logs: number; shopping: number; dict: number; barcodes: number };
}

export function parseBackup(text: string): { ok: true; data: BackupFile } | { ok: false; message: string } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, message: 'JSON 解析失败，文件可能已损坏' };
  }
  const v = validateBackup(raw);
  if (!v.ok) return { ok: false, message: v.message };
  return { ok: true, data: raw as BackupFile };
}

/** 合并冲突：取 updatedAt 较大者；位置按 sort 重排 */
export async function importBackup(data: BackupFile, mode: ImportMode): Promise<ImportResult> {
  const incomingLocations = (data.locations ?? []).filter((l) => !l.deletedAt);
  const incomingItems = (data.items ?? []).filter((i) => !i.deletedAt);
  const incomingLogs = (data.logs ?? []).filter((l) => !l.deletedAt);
  const incomingShopping = (data.shopping ?? []).filter((s) => !s.deletedAt);
  const incomingDict = (data.dict ?? []).filter((d) => !d.deletedAt);
  // v1 备份没有 barcodes 字段，必须 `?? []` 兜底
  const incomingBarcodes = (data.barcodes ?? []).filter((b) => !b.deletedAt);

  try {
    await db.transaction(async () => {
      if (mode === 'replace') {
        await db.wipe();
        await db.locations.bulkPut(incomingLocations);
        await db.items.bulkPut(incomingItems);
        await db.logs.bulkPut(incomingLogs);
        await db.shopping.bulkPut(incomingShopping);
        await db.dict.bulkPut(incomingDict);
        await db.barcodes.bulkPut(incomingBarcodes);
        if (data.settings) await db.settings.save(data.settings);
        return;
      }

      // merge
      const [curLocations, curItems, curLogs, curShopping, curDict, curBarcodes] = await Promise.all([
        db.locations.all(),
        db.items.all(),
        db.logs.all(),
        db.shopping.all(),
        db.dict.all(),
        db.barcodes.all(),
      ]);

      await db.locations.bulkPut(mergeById<Location>(curLocations, incomingLocations));
      await db.items.bulkPut(mergeById<Item>(curItems, incomingItems));
      await db.logs.bulkPut(mergeById<ConsumeLog>(curLogs, incomingLogs));
      await db.shopping.bulkPut(mergeById<ShoppingItem>(curShopping, incomingShopping));
      await db.dict.bulkPut(mergeById<DictEntry>(curDict, incomingDict));
      await db.barcodes.bulkPut(mergeById<BarcodeEntry>(curBarcodes, incomingBarcodes));
    });

    // 位置排序重排（在事务外做，避免与 bulkPut 冲突）
    const locs = await db.locations.all();
    const sorted = [...locs].sort((a, b) => a.sort - b.sort);
    const now = Date.now();
    await db.locations.bulkPut(sorted.map((l, i) => ({ ...l, sort: (i + 1) * 10, updatedAt: now })));

    return {
      ok: true,
      message: mode === 'replace' ? '已覆盖导入' : '已合并导入',
      counts: {
        items: incomingItems.length,
        locations: incomingLocations.length,
        logs: incomingLogs.length,
        shopping: incomingShopping.length,
        dict: incomingDict.length,
        barcodes: incomingBarcodes.length,
      },
    };
  } catch (e) {
    return { ok: false, message: `导入失败：${(e as Error).message}` };
  }
}

function mergeById<T extends { id: string; createdAt: number }>(cur: T[], inc: T[]): T[] {
  const map = new Map<string, T>();
  for (const c of cur) map.set(c.id, c);
  for (const i of inc) {
    const prev = map.get(i.id);
    const it = (i as { updatedAt?: number }).updatedAt ?? i.createdAt;
    const pt = prev ? ((prev as { updatedAt?: number }).updatedAt ?? prev.createdAt) : 0;
    if (!prev || it >= pt) map.set(i.id, i);
  }
  return Array.from(map.values());
}
