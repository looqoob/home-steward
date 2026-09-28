/** 环境类型：决定保质期，与「位置」解耦 */
export type EnvType =
  | 'chilled' // 冷藏 0–4℃
  | 'frozen' // 冷冻 −18℃
  | 'cool' // 常温阴凉
  | 'dry' // 常温干燥
  | 'ventilated' // 常温通风
  | 'dark' // 常温避光
  | 'none'; // 不计保质期（日用品预留）

/** 哨兵值：该食材不宜放此环境 */
export const NOT_RECOMMENDED = -1;
export type ShelfLifeValue = number | typeof NOT_RECOMMENDED;

export type CategoryKey =
  | 'vegetable'
  | 'fruit'
  | 'meat'
  | 'seafood'
  | 'eggMilk'
  | 'soy'
  | 'grainOil'
  | 'dryGoods'
  | 'seasoning'
  | 'frozenFood'
  | 'other';

export type EnvGroup = 'cold' | 'frozen' | 'normal';

export interface EnvMeta {
  key: EnvType;
  label: string; // 「冷藏」
  fullLabel: string; // 「冷藏 0–4℃」
  group: EnvGroup;
  dotClass: string;
  color: string;
}

export const ENV_LIST: EnvMeta[] = [
  { key: 'chilled', label: '冷藏', fullLabel: '冷藏 0–4℃', group: 'cold', dotClass: 'cold', color: '#4A8FD4' },
  { key: 'frozen', label: '冷冻', fullLabel: '冷冻 −18℃', group: 'frozen', dotClass: 'frozen', color: '#7FA8D9' },
  { key: 'cool', label: '阴凉', fullLabel: '常温阴凉', group: 'normal', dotClass: 'cool', color: '#8C7FA6' },
  { key: 'dry', label: '干燥', fullLabel: '常温干燥', group: 'normal', dotClass: 'dry', color: '#C4A05A' },
  { key: 'ventilated', label: '通风', fullLabel: '常温通风', group: 'normal', dotClass: 'air', color: '#6FA98C' },
  { key: 'dark', label: '避光', fullLabel: '常温避光', group: 'normal', dotClass: 'dark', color: '#5E6B78' },
  { key: 'none', label: '不计', fullLabel: '不计保质期', group: 'normal', dotClass: 'dark', color: '#5E6B78' },
];

export const ENV_MAP: Record<EnvType, EnvMeta> = ENV_LIST.reduce(
  (acc, e) => {
    acc[e.key] = e;
    return acc;
  },
  {} as Record<EnvType, EnvMeta>,
);

export const CATEGORY_LABEL: Record<CategoryKey, string> = {
  vegetable: '蔬菜',
  fruit: '水果',
  meat: '肉禽',
  seafood: '水产',
  eggMilk: '蛋奶',
  soy: '豆制品',
  grainOil: '米面粮油',
  dryGoods: '干货',
  seasoning: '调味',
  frozenFood: '冷冻食品',
  other: '其他',
};

export interface Location {
  id: string;
  name: string;
  icon: string;
  env: EnvType;
  sort: number;
  enabled: boolean;
  builtin: boolean;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
}

export type ItemStatus = 'in_stock' | 'finished';
export type ShelfLifeSource = 'custom' | 'builtin' | 'category' | 'global' | 'manual' | 'none';

export interface Item {
  id: string;
  name: string;
  dictKey: string | null;
  category: CategoryKey | null;
  icon: string;
  quantity: number;
  unit: string;
  price: number | null;
  locationId: string;

  storedAt: string; // YYYY-MM-DD 入库日期
  producedAt: string | null; // YYYY-MM-DD 生产日期
  expireAt: string | null; // YYYY-MM-DD 到期日
  shelfLifeDays: number | null; // 当期采用的天数快照
  shelfLifeSource: ShelfLifeSource;
  manualShelfLife: number | null; // 用户手填，优先级最高
  notRecommended: boolean;
  notRecommendedReason: string | null;

  status: ItemStatus;
  note: string | null;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
}

export type ConsumeType = 'consumed' | 'wasted';

export interface ConsumeLog {
  id: string;
  itemId: string;
  name: string;
  quantity: number;
  unit: string;
  locationId: string;
  type: ConsumeType;
  price: number | null;
  expireAt: string | null;
  overdueDays: number | null;
  at: number;
  createdAt: number;
  deletedAt: number | null;
}

export interface DictEntry {
  id: string;
  dictKey: string;
  displayName: string;
  env: EnvType;
  days: ShelfLifeValue;
  reason: string | null;
  origin: 'custom';
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
}

export type ShopReason = 'out_of_stock' | 'near_expiry' | 'frequent_waste' | 'manual';

export interface ShoppingItem {
  id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  locationId: string | null;
  reason: ShopReason;
  sourceItemId: string | null;
  checked: boolean;
  checkedAt: number | null;
  auto: boolean;
  dismissedUntil: number | null;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
}

export interface Settings {
  id: 'singleton';
  schemaVersion: number;
  dictVersion: number;
  remindEnabled: boolean;
  remindHour: number;
  remindMinute: number;
  soonDays: number;
  urgentDays: number;
  lastRemindAt: number | null;
  lastBackupAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export const DEFAULT_SETTINGS: Omit<Settings, 'createdAt' | 'updatedAt'> = {
  id: 'singleton',
  schemaVersion: 1,
  dictVersion: 1,
  remindEnabled: true,
  remindHour: 9,
  remindMinute: 0,
  soonDays: 14,
  urgentDays: 3,
  lastRemindAt: null,
  lastBackupAt: null,
};

export const SCHEMA_VERSION = 1;
export const BUILTIN_DICT_VERSION = 1;
