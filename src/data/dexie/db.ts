import Dexie, { type Table } from 'dexie';
import type { BarcodeEntry, ConsumeLog, DictEntry, Item, Location, Settings, ShoppingItem } from '@/domain/types';

export class AppDB extends Dexie {
  items!: Table<Item, string>;
  locations!: Table<Location, string>;
  logs!: Table<ConsumeLog, string>;
  shopping!: Table<ShoppingItem, string>;
  dict!: Table<DictEntry, string>;
  settings!: Table<Settings, string>;
  /** v2 新增：条码 → 名称的本地映射 */
  barcodes!: Table<BarcodeEntry, string>;

  constructor() {
    super('home-steward');
    this.version(1).stores({
      items: 'id, name, locationId, expireAt, status, deletedAt, updatedAt',
      locations: 'id, sort, enabled, deletedAt',
      logs: 'id, at, type, name, deletedAt',
      shopping: 'id, checked, reason, deletedAt',
      dict: 'id, dictKey, env, deletedAt',
      settings: 'id',
    });
    // v2：只加一张新表，不改任何旧表的索引。
    // Dexie 的 version(n) 是增量声明，v1 的数据会自动带上新表，无需 upgrade()。
    this.version(2).stores({
      barcodes: 'id, code, name, deletedAt',
    });
  }
}

export const dexieDb = new AppDB();
