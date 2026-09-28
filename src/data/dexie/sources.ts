import type { DataSources, DictRepository, ItemRepository, LocationRepository, LogRepository, ShoppingRepository, SettingsRepository } from '../repository';
import type { ConsumeLog, DictEntry, Item, Location, Settings, ShoppingItem } from '@/domain/types';
import { DEFAULT_SETTINGS } from '@/domain/types';
import type { Table } from 'dexie';
import { dexieDb } from './db';

function base<T extends { id: string; deletedAt: number | null }>(table: Table<T, string>) {
  return {
    async all(): Promise<T[]> {
      const rows = await table.toArray();
      return rows.filter((r) => !r.deletedAt);
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
      const r = await table.get(id);
      if (!r) return;
      await table.put({ ...r, deletedAt: Date.now() } as T);
    },
    async hardDelete(id: string) {
      await table.delete(id);
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

export function createDexieSources(): DataSources {
  return {
    items,
    locations,
    logs,
    shopping,
    dict,
    settings,
    async transaction<T>(fn: () => Promise<T>): Promise<T> {
      return dexieDb.transaction('rw', [dexieDb.items, dexieDb.locations, dexieDb.logs, dexieDb.shopping, dexieDb.dict, dexieDb.settings], fn);
    },
    async wipe() {
      await dexieDb.transaction('rw', [dexieDb.items, dexieDb.locations, dexieDb.logs, dexieDb.shopping, dexieDb.dict], async () => {
        await dexieDb.items.clear();
        await dexieDb.locations.clear();
        await dexieDb.logs.clear();
        await dexieDb.shopping.clear();
        await dexieDb.dict.clear();
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
