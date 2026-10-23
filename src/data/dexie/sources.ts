import type { BarcodeRepository, DataSources, DictRepository, ItemRepository, LocationRepository, LogRepository, ShoppingRepository, SettingsRepository } from '../repository';
import type { BarcodeEntry, ConsumeLog, DictEntry, Item, Location, Settings, ShoppingItem } from '@/domain/types';
import { DEFAULT_SETTINGS } from '@/domain/types';
import type { Table } from 'dexie';
import { dexieDb } from './db';

function base<T extends { id: string; deletedAt: number | null }>(table: Table<T, string>) {
  return {
    async all(): Promise<T[]> {
      const rows = await table.toArray();
      return rows.filter((r) => !r.deletedAt);
    },
    async countAll(): Promise<number> {
      return table.count();
    },
    async byId(id: string) {
      const r = await table.get(id);
      return r && !r.deletedAt ? r : undefined;
    },
    async put(entity: T) {
      await table.put(entity);
    },
    async bulkPut(entities: T[]) {
      await table.bulkPut(entities);
    },
    async softDelete(id: string) {
      // ⚠️ 用 table.update 而非 get+put：get 与 put 是两个独立事务，
      // 中间可插入其它写入，put 会用旧值整条覆盖（lost-update）。
      // update 是单事务 partial update，原子且只改目标字段。
      // Dexie 的 UpdateSpec<T> 对泛型 T 约束过严，这里 as any 绕类型层，
      // 运行时 update(key, changes) 接受任意 partial 对象。
      await table.update(id, { deletedAt: Date.now(), updatedAt: Date.now() } as any);
    },
    async hardDelete(id: string) {
      await table.delete(id);
    },
    async bulkDelete(ids: string[]) {
      // ⚠️ 一次性删，替代 for-await：串行 await 在 Dexie 事务里逐次 yield 事件循环，
      // ids 多时可能撞事务超时（TransactionInactiveError）。
      await table.bulkDelete(ids);
    },
    async clear() {
      await table.clear();
    },
  };
}

const items: ItemRepository = {
  ...base<Item>(dexieDb.items),
  async byLocation(locationId: string) {
    const rows = await dexieDb.items.where('locationId').equals(locationId).toArray();
    return rows.filter((r) => !r.deletedAt);
  },
};

const locations: LocationRepository = {
  ...base<Location>(dexieDb.locations),
  async enabled() {
    const rows = await dexieDb.locations.toArray();
    return rows.filter((r) => !r.deletedAt && r.enabled).sort((a, b) => a.sort - b.sort);
  },
};

const logs: LogRepository = {
  ...base<ConsumeLog>(dexieDb.logs),
  async since(ts: number) {
    const rows = await dexieDb.logs.where('at').above(ts).toArray();
    return rows.filter((r) => !r.deletedAt);
  },
};

const shopping: ShoppingRepository = base<ShoppingItem>(dexieDb.shopping);

const dict: DictRepository = {
  ...base<DictEntry>(dexieDb.dict),
  async byKey(dictKey: string) {
    const rows = await dexieDb.dict.where('dictKey').equals(dictKey).toArray();
    return rows.filter((r) => !r.deletedAt);
  },
};

const settings: SettingsRepository = {
  async get(): Promise<Settings> {
    const s = await dexieDb.settings.get('singleton');
    if (s) return s;
    const now = Date.now();
    const fresh: Settings = { ...DEFAULT_SETTINGS, createdAt: now, updatedAt: now };
    await dexieDb.settings.put(fresh);
    return fresh;
  },
  async save(s: Settings) {
    await dexieDb.settings.put({ ...s, updatedAt: Date.now() });
  },
};

const barcodes: BarcodeRepository = {
  ...base<BarcodeEntry>(dexieDb.barcodes),
  async byCode(code: string) {
    // ⚠️ 必须原样传 string 比较：条码有前导 0，转成数字就再也匹配不上
    const rows = await dexieDb.barcodes.where('code').equals(code).toArray();
    return rows.find((r) => !r.deletedAt);
  },
};

export function createDexieSources(): DataSources {
  return {
    items,
    locations,
    logs,
    shopping,
    dict,
    settings,
    barcodes,
    async transaction<T>(fn: () => Promise<T>): Promise<T> {
      return dexieDb.transaction(
        'rw',
        [dexieDb.items, dexieDb.locations, dexieDb.logs, dexieDb.shopping, dexieDb.dict, dexieDb.settings, dexieDb.barcodes],
        fn,
      );
    },
    async wipe() {
      await dexieDb.transaction('rw', [dexieDb.items, dexieDb.locations, dexieDb.logs, dexieDb.shopping, dexieDb.dict, dexieDb.barcodes], async () => {
        await dexieDb.items.clear();
        await dexieDb.locations.clear();
        await dexieDb.logs.clear();
        await dexieDb.shopping.clear();
        await dexieDb.dict.clear();
        // ⚠️ 别漏：漏了会导致「覆盖导入」后旧条码映射残留
        await dexieDb.barcodes.clear();
      });
    },
    async probe(): Promise<boolean> {
      // 只读探测 + 缺失时补写默认设置（绝不覆盖已有设置）
      try {
        const s = await dexieDb.settings.get('singleton');
        if (!s) {
          const now = Date.now();
          await dexieDb.settings.put({ ...DEFAULT_SETTINGS, createdAt: now, updatedAt: now });
        }
        return true;
      } catch {
        return false;
      }
    },
  };
}
