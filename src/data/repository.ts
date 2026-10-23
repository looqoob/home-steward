import type { BarcodeEntry, ConsumeLog, DictEntry, Item, Location, Settings, ShoppingItem } from '@/domain/types';

/**
 * 持久化抽象层。业务代码只依赖这些接口，
 * 将来把 Dexie 换成 SQLite（@capacitor-community/sqlite）时只改 data/index.ts 一行。
 * 全部返回 Promise —— 与原生插件的异步 API 对齐，避免将来连锁重构。
 */
export interface Repository<T extends { id: string }> {
  all(): Promise<T[]>;
  /**
   * 表内**全部**行数，**包含软删除的行**。
   *
   * ⚠️ 与 `all().length` 不是一回事：`all()` 过滤了 `deletedAt`，所以「用户把所有位置
   * 都删了」与「首次启动」的返回值都是 0。`ensureSeed` 必须靠它区分两者，
   * 否则每次启动都会把预设位置重新播一遍（用户删不掉、还会插进列表中间）。
   */
  countAll(): Promise<number>;
  byId(id: string): Promise<T | undefined>;
  put(entity: T): Promise<void>;
  bulkPut(entities: T[]): Promise<void>;
  softDelete(id: string): Promise<void>;
  hardDelete(id: string): Promise<void>;
  bulkDelete(ids: string[]): Promise<void>;
  clear(): Promise<void>;
}

export interface LocationRepository extends Repository<Location> {
  enabled(): Promise<Location[]>;
}

export interface ItemRepository extends Repository<Item> {
  byLocation(locationId: string): Promise<Item[]>;
}

export interface LogRepository extends Repository<ConsumeLog> {
  since(ts: number): Promise<ConsumeLog[]>;
}

export interface ShoppingRepository extends Repository<ShoppingItem> {}

export interface DictRepository extends Repository<DictEntry> {
  byKey(dictKey: string): Promise<DictEntry[]>;
}

export interface SettingsRepository {
  get(): Promise<Settings>;
  save(s: Settings): Promise<void>;
}

export interface BarcodeRepository extends Repository<BarcodeEntry> {
  /**
   * 按条码查映射。
   *
   * ⚠️ `code` 是 **string**：EAN-13 有前导 0，数据库里用 `where('code').equals(code)` 比较，
   * 传数字会因类型不符而查不到。
   */
  byCode(code: string): Promise<BarcodeEntry | undefined>;
}

export interface DataSources {
  items: ItemRepository;
  locations: LocationRepository;
  logs: LogRepository;
  shopping: ShoppingRepository;
  dict: DictRepository;
  settings: SettingsRepository;
  barcodes: BarcodeRepository;
  transaction<T>(fn: () => Promise<T>): Promise<T>;
  /** 清空所有业务数据（导入「覆盖」时使用） */
  wipe(): Promise<void>;
  /** 存储可用性探针：IndexedDB 被限制时返回 false */
  probe(): Promise<boolean>;
}
