import { defineStore } from 'pinia';
import { ref } from 'vue';
import { db } from '@/data';
import type { BarcodeEntry } from '@/domain/types';
import { newId } from '@/domain/ids';
import { normalizePrice } from '@/domain/price';

export interface BarcodeInput {
  /** ⚠️ 必须 string：EAN-13 有前导 0，传数字会丢 */
  code: string;
  name: string;
  quantity?: number | null;
  unit?: string | null;
  locationId?: string | null;
  /** 单价（元 / 单位）；不传 = 沿用旧值，`null` = 清掉 */
  price?: number | null;
}

/**
 * 条码 → 名称的本地映射。
 *
 * 隐私边界：这张表**只存本机**，不联网查询任何商品数据库。
 * 用户首次扫到未知条码时手输一次名称，之后扫码即可自动带出。
 */
export const useBarcodesStore = defineStore('barcodes', () => {
  const list = ref<BarcodeEntry[]>([]);
  const loaded = ref(false);

  async function load() {
    list.value = await db.barcodes.all();
    loaded.value = true;
  }

  /**
   * 按条码查映射。
   * @param code 条码字符串，**不要**先转 Number（前导 0 会丢）
   */
  async function lookup(code: string): Promise<BarcodeEntry | undefined> {
    const c = code.trim();
    if (!c) return undefined;
    const hit = list.value.find((b) => b.code === c);
    if (hit) return hit;
    // 内存没有（首启动未 load）时兜底查一次库
    return db.barcodes.byCode(c);
  }

  /**
   * 新建或覆盖一条映射。
   *
   * 同条码已存在时**覆盖**（用户扫错了就该能改），而不是报重复错误。
   * 旧记录走软删除再新建会留下垃圾行，直接 `put` 更新更干净。
   */
  async function upsert(input: BarcodeInput): Promise<BarcodeEntry | undefined> {
    const code = input.code.trim();
    const name = input.name.trim();
    if (!code || !name) return undefined;
    const now = Date.now();
    const prev = list.value.find((b) => b.code === code);
    const row: BarcodeEntry = {
      id: prev?.id ?? newId(),
      code,
      name,
      quantity: input.quantity ?? prev?.quantity ?? null,
      unit: (input.unit ?? prev?.unit ?? null) || null,
      locationId: input.locationId ?? prev?.locationId ?? null,
      // 单价走同一口径：非法值（负数 / Infinity / 字符串）一律存 null，别写进库
      price: normalizePrice(input.price ?? prev?.price ?? null),
      createdAt: prev?.createdAt ?? now,
      updatedAt: now,
      deletedAt: null,
    };
    await db.barcodes.put(row);
    await load();
    return row;
  }

  /** 改名 / 改默认值（管理页用） */
  async function update(id: string, patch: Partial<BarcodeInput>) {
    const cur = list.value.find((b) => b.id === id);
    if (!cur) return;
    const next: BarcodeEntry = {
      ...cur,
      code: (patch.code ?? cur.code).trim(),
      name: (patch.name ?? cur.name).trim(),
      quantity: patch.quantity === undefined ? cur.quantity : patch.quantity,
      unit: (patch.unit === undefined ? cur.unit : patch.unit) || null,
      locationId: patch.locationId === undefined ? cur.locationId : patch.locationId,
      price: patch.price === undefined ? normalizePrice(cur.price) : normalizePrice(patch.price),
      updatedAt: Date.now(),
    };
    await db.barcodes.put(next);
    await load();
  }

  /** 软删除映射（扫错了要能删） */
  async function remove(id: string) {
    await db.barcodes.softDelete(id);
    await load();
  }

  return { list, loaded, load, lookup, upsert, update, remove };
});
