import type { BarcodeEntry, ConsumeLog, DictEntry, Item, Location, Settings, ShoppingItem, StockSnapshot } from '@/domain/types';
import { SCHEMA_VERSION } from '@/domain/types';

export interface BackupFile {
  app: 'home-steward';
  version: number;
  exportedAt: number;
  items: Item[];
  locations: Location[];
  logs: ConsumeLog[];
  shopping: ShoppingItem[];
  dict: DictEntry[];
  /**
   * v2 新增。
   *
   * ⚠️ 声明为可选：v1 备份里没有这个键，导入时用 `?? []` 兜底。
   * 若声明为必填，v1 备份导入会在类型层面就说不通。
   */
  barcodes?: BarcodeEntry[];
  /** v3（v1.1 F4）新增。可选：v1/v2 备份没有这个键，导入时 `?? []` 兜底 */
  snapshots?: StockSnapshot[];
  settings: Settings;
}

export function emptyBackup(): BackupFile {
  return {
    app: 'home-steward',
    version: SCHEMA_VERSION,
    exportedAt: Date.now(),
    items: [],
    locations: [],
    logs: [],
    shopping: [],
    dict: [],
    barcodes: [],
    snapshots: [],
    settings: {} as Settings,
  };
}

export interface Validation {
  ok: boolean;
  message: string;
}

/** 宽松校验：只检查结构，不逐字段校验（字典/实体字段将来可能扩展） */
export function validateBackup(raw: unknown): Validation {
  if (!raw || typeof raw !== 'object') return { ok: false, message: '文件内容不是有效的 JSON 对象' };
  const o = raw as Partial<BackupFile>;
  if (o.app !== 'home-steward') return { ok: false, message: '不是本应用的备份文件' };
  if (typeof o.version !== 'number') return { ok: false, message: '备份文件缺少版本号' };
  if (o.version > SCHEMA_VERSION) return { ok: false, message: `备份版本 ${o.version} 高于当前应用支持的 ${SCHEMA_VERSION}` };
  if (!Array.isArray(o.items) || !Array.isArray(o.locations)) return { ok: false, message: '备份文件缺少物品或位置数据' };
  return { ok: true, message: '' };
}
