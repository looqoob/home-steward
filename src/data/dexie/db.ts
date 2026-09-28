import Dexie, { type Table } from 'dexie';
import type { ConsumeLog, DictEntry, Item, Location, Settings, ShoppingItem } from '@/domain/types';

export class AppDB extends Dexie {
  items!: Table<Item, string>;
  locations!: Table<Location, string>;
  logs!: Table<ConsumeLog, string>;
  shopping!: Table<ShoppingItem, string>;
  dict!: Table<DictEntry, string>;
  settings!: Table<Settings, string>;

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
  }
}

export const dexieDb = new AppDB();
