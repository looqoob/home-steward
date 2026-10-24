import { db } from '../index';
import type { BackupFile } from './schema';
import { validateBackup } from './schema';
import {
  sanitizeDict,
  sanitizeItems,
  sanitizeLocations,
  sanitizeLogs,
  sanitizeShopping,
  type SanitizeResult,
} from './sanitize';
import type { BarcodeEntry, ConsumeLog, DictEntry, Item, Location, ShoppingItem } from '@/domain/types';
import { todayStr } from '@/domain/dates';
import { normalizeSettings } from '@/domain/settings';

export type ImportMode = 'replace' | 'merge';

export interface ImportResult {
  ok: boolean;
  message: string;
  counts?: { items: number; locations: number; logs: number; shopping: number; dict: number; barcodes: number };
  /**
   * 清洗统计：因字段非法被**丢弃**或被**修正**的记录数。
   *
   * 必须能展示给用户 —— 静默丢数据是不可接受的：用户导入完发现少了几件却不知道少了什么，
   * 只能重装应用碰运气。
   */
  sanitized?: { dropped: number; fixed: number };
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
  // ⚠️ 清洗必须在写库**之前**：`validateBackup` 只看信封，脏记录（`storedAt: 0` 之类）
  // 一旦落库就会让「我的」「库存」两个主 Tab 计算日期时抛错白屏，而本机没有副本可回滚。
  // 详见 `sanitize.ts` 顶部的说明。
  const today = todayStr();
  const itemsR = sanitizeItems(data.items ?? [], today);
  const locsR = sanitizeLocations(data.locations ?? []);
  const logsR = sanitizeLogs(data.logs ?? []);
  const shopR = sanitizeShopping(data.shopping ?? []);
  // ⚠️ 字典必须清洗：不洗的话 `dictKey: null` 会让 `stores/dict` 的 `buildCustomMap`
  // 在 `.trim()` 上抛 TypeError，物品编辑 / 快速入库 / 扫码 / 清单入库四处**一起白屏**。
  const dictR = sanitizeDict(data.dict ?? []);
  const incomingItems = itemsR.rows;
  const incomingLocations = locsR.rows;
  const incomingLogs = logsR.rows;
  const incomingShopping = shopR.rows;
  const incomingDict = dictR.rows;
  // v1 备份没有 barcodes 字段，必须 `?? []` 兜底
  const incomingBarcodes = (data.barcodes ?? []).filter((b) => b && !b.deletedAt);

  const dropped = itemsR.dropped + locsR.dropped + logsR.dropped + shopR.dropped + dictR.dropped;
  const fixed = itemsR.fixed + locsR.fixed + logsR.fixed + shopR.fixed + dictR.fixed;

  // ★ 防空覆盖：备份信封合法、但**物品全被清洗掉**时，`replace` 会先清空 6 张表再写入 0 条，
  // 结果「数据没了、还提示成功」。宁可中止导入、保留本机数据，也不能让用户以为备份可用。
  const sourceItemCount = Array.isArray(data.items) ? data.items.length : 0;
  if (sourceItemCount > 0 && incomingItems.length === 0) {
    return {
      ok: false,
      message: `备份里的 ${sourceItemCount} 条物品记录全部无法识别（缺 id / name，或字段不合法），已中止导入，本机数据未改动。`,
    };
  }

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
        // ⚠️ 导入路径**不经过 store**，设置必须在这里过同一套归一化：
        // `id` 非 'singleton' 的记录永远读不到（垃圾行 + 整份设置静默不生效）。
        if (data.settings) await db.settings.save(normalizeSettings(data.settings));
        return;
      }

      // merge
      // ⚠️ 现状必须读「含软删除」的全量行（tombstone）：本地删除（deletedAt 非空）也要参与
      // 新旧比较。只拿活行的话，本地删掉的记录在旧备份里仍然存在且 updatedAt 可能更新，
      // 会被原样写回 —— 用户删掉的东西随导入复活（REV-33）。
      const [curLocations, curItems, curLogs, curShopping, curDict, curBarcodes] = await Promise.all([
        db.locations.allIncludingDeleted(),
        db.items.allIncludingDeleted(),
        db.logs.allIncludingDeleted(),
        db.shopping.allIncludingDeleted(),
        db.dict.allIncludingDeleted(),
        db.barcodes.allIncludingDeleted(),
      ]);

      const mergedLocations = mergeById<Location>(curLocations, incomingLocations);
      await db.locations.bulkPut(mergedLocations);
      await db.items.bulkPut(mergeById<Item>(curItems, incomingItems));
      await db.logs.bulkPut(mergeById<ConsumeLog>(curLogs, incomingLogs));
      await db.shopping.bulkPut(mergeById<ShoppingItem>(curShopping, incomingShopping));
      await db.dict.bulkPut(mergeById<DictEntry>(curDict, incomingDict));
      await db.barcodes.bulkPut(mergeById<BarcodeEntry>(curBarcodes, incomingBarcodes));

      // 位置排序重排必须在**同一事务**内收尾（REV-33）：放在事务外的话，
      // 重排失败会得到「数据已导入但返回 ok:false」，本机状态与提示不一致；
      // 且每行都刷 updatedAt 会让本机位置永远「更新」、合并导入的位置改名进不来。
      const sorted = [...mergedLocations].sort((a, b) => a.sort - b.sort);
      await db.locations.bulkPut(sorted.map((l, i) => ({ ...l, sort: (i + 1) * 10 })));
    });

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
      sanitized: { dropped, fixed },
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
