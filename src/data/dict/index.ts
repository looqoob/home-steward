import type { CategoryKey, DictEntry, EnvType, ShelfLifeValue } from '@/domain/types';
import { NOT_RECOMMENDED } from '@/domain/types';
import type { ResolveResult, ShelfLifeResolver } from '@/domain/shelfLife';
import { BUILTIN_FOODS } from './builtin';
import { CATEGORY_DEFAULTS, GLOBAL_DEFAULTS, guessCategory } from '@/domain/categories';
import { normalizeName } from './normalize';

export { fallbackDays } from '@/domain/categories';

export interface BuiltinIndex {
  /** 标准名 → 食材 */
  foods: Map<string, (typeof BUILTIN_FOODS)[number]>;
  /** 标准名 / 别名 → 食材 */
  byName: Map<string, (typeof BUILTIN_FOODS)[number]>;
}

let cached: BuiltinIndex | null = null;

export function builtinIndex(): BuiltinIndex {
  if (cached) return cached;
  const foods = new Map<string, (typeof BUILTIN_FOODS)[number]>();
  const byName = new Map<string, (typeof BUILTIN_FOODS)[number]>();
  for (const f of BUILTIN_FOODS) {
    const k = normalizeName(f.key);
    foods.set(k, f);
    byName.set(k, f);
    for (const a of f.aliases) byName.set(normalizeName(a), f);
  }
  cached = { foods, byName };
  return cached;
}

export function lookupFood(name: string) {
  return builtinIndex().byName.get(normalizeName(name));
}

export function categoryOf(name: string): CategoryKey | null {
  const f = lookupFood(name);
  if (f) return f.category;
  return guessCategory(name);
}

/** 用户自定义字典 → 内存索引（key: `${dictKey}|${env}`） */
export function buildCustomMap(entries: DictEntry[]): Map<string, DictEntry> {
  const m = new Map<string, DictEntry>();
  for (const e of entries) {
    if (e.deletedAt) continue;
    m.set(`${normalizeName(e.dictKey)}|${e.env}`, e);
  }
  return m;
}

/**
 * 四级兜底查询链：自定义 → 内置 → 品类 → 全局 → null（需手填）
 */
export function resolveWith(custom: Map<string, DictEntry>, name: string, env: EnvType): ResolveResult {
  const key = normalizeName(name);
  const c = custom.get(`${key}|${env}`);
  if (c) return { days: c.days, source: 'custom', reason: c.reason };

  const f = builtinIndex().byName.get(key);
  if (f) {
    const v = f.envs[env];
    if (v !== undefined) {
      return { days: v === NOT_RECOMMENDED ? NOT_RECOMMENDED : v, source: 'builtin', reason: f.notRecommendedReason?.[env] ?? null };
    }
  }

  const cat = f?.category ?? guessCategory(name);
  if (cat) {
    const v = CATEGORY_DEFAULTS[cat]?.[env];
    if (v !== undefined && v > 0) return { days: v, source: 'category', reason: null };
  }

  const g = GLOBAL_DEFAULTS[env];
  if (g && g > 0) return { days: g, source: 'global', reason: null };

  return { days: null, source: 'none', reason: null };
}

export function createResolver(custom: Map<string, DictEntry>): ShelfLifeResolver {
  return (name, env) => resolveWith(custom, name, env);
}

/** 全部内置食材（字典页展示用），按品类分组 */
export function allBuiltinFoods() {
  return BUILTIN_FOODS;
}

export function shelfLifeText(days: ShelfLifeValue | null): string {
  if (days === null) return '未设置';
  if (days === NOT_RECOMMENDED) return '不建议';
  if (days >= 365) {
    const y = Math.round((days / 365) * 10) / 10;
    return `${y} 年`;
  }
  return `${days} 天`;
}
