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

/**
 * ⚠️ 这里的 `color` 与 `src/styles/index.css` 的 `--env-*` 是同一组颜色的两份定义，
 * **改任一侧都必须同步另一侧**。取值已按 WCAG 1.4.11（非文本图形 ≥3:1）校准，
 * 括号内为对白底实测对比度。
 */
export const ENV_LIST: EnvMeta[] = [
  { key: 'chilled', label: '冷藏', fullLabel: '冷藏 0–4℃', group: 'cold', dotClass: 'cold', color: '#4A8FD4' }, // 3.40:1
  { key: 'frozen', label: '冷冻', fullLabel: '冷冻 −18℃', group: 'frozen', dotClass: 'frozen', color: '#5B87BE' }, // 3.71:1
  { key: 'cool', label: '阴凉', fullLabel: '常温阴凉', group: 'normal', dotClass: 'cool', color: '#8C7FA6' }, // 3.68:1
  { key: 'dry', label: '干燥', fullLabel: '常温干燥', group: 'normal', dotClass: 'dry', color: '#A9823C' }, // 3.53:1
  { key: 'ventilated', label: '通风', fullLabel: '常温通风', group: 'normal', dotClass: 'air', color: '#4F8A6E' }, // 4.04:1
  { key: 'dark', label: '避光', fullLabel: '常温避光', group: 'normal', dotClass: 'dark', color: '#5E6B78' }, // 5.45:1
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
  /**
   * 本次金额 = 单价 × 消耗数量（见 `stores/items.consume` 的写入说明）。
   * 明细里的「金额」列与「本月浪费金额」统计都读它，不是 `unitPrice`。
   */
  price: number | null;
  /**
   * 消耗时的**单价**快照（元/单位），用于明细「单价」列。
   * 旧日志无此字段（运行时为 `undefined`），展示以 `== null` 兜底为「-」。
   */
  unitPrice?: number | null;
  /**
   * 物品备注快照，明细「备注」列展示。
   * 旧日志无此字段（运行时为 `undefined`），空时隐藏备注行。
   */
  note?: string | null;
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

/**
 * 外观主题模式。
 *
 * - `light` / `dark`：用户手动锁定；
 * - `system`：跟随系统 `prefers-color-scheme`（默认）。
 *
 * `system` 只是**存储值**，运行时一定会被解析成 `light` 或 `dark`
 * （Vant 的 `van-config-provider` 不认识 `system`）。解析在 `composables/useTheme.ts`。
 */
export type ThemeMode = 'light' | 'dark' | 'system';

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
  /** 外观：主题模式，默认跟随系统 */
  themeMode: ThemeMode;
  /** 外观：主题色（`#rrggbb`）。非法值由 `domain/accent.ts` 兜底为 `DEFAULT_ACCENT` */
  accent: string;
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
  themeMode: 'system',
  accent: '#228055',
};

export const SCHEMA_VERSION = 1;
export const BUILTIN_DICT_VERSION = 1;
