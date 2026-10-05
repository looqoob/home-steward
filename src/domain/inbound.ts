/**
 * 「购物清单 → 一键入库」的推导逻辑（纯函数）。
 *
 * 场景：超市照着清单买完，回家把东西放进冰箱。不该再把同样的名字敲一遍。
 * 本模块负责**推断默认值**（数量 / 单位 / 位置），让用户多数时候只需点一下「入库」。
 */

import type { Item, Location, ShoppingItem } from './types';
import type { NewItemInput } from './itemFactory';
import { normalizeName } from './normalize';

export interface InboundDefaults {
  quantity: number;
  unit: string;
  locationId: string | null;
}

/** 只保留在库物品，按入库时间倒序（最近买的排最前） */
function recentItems(items: Item[]): Item[] {
  return items
    .filter((i) => !i.deletedAt && i.status === 'in_stock')
    .sort((a, b) => (b.createdAt > a.createdAt ? 1 : b.createdAt < a.createdAt ? -1 : 0));
}

/**
 * 名称 → 字典规范 key 的解析器（「西红柿」与「番茄」应返回同一个 key，未命中返回 `null`）。
 *
 * 由调用方提供：**`domain` 不能依赖 `data`**，内置字典住在 `data/dict` 里。
 * 与 `ShelfLifeResolver` 同一套思路：纯函数只声明需要什么能力，实现由外层注入。
 */
export type AliasKeyResolver = (name: string) => string | null;

/**
 * 历史物品的名称匹配：先按**形式归一化**比，再按**字典别名**比。
 *
 * ⚠️ 只靠 `normalizeName` 匹配不上「西红柿 ↔ 番茄」——它只做全角 / 括号 / 空格 / 大小写的
 * 归一，**没有同义词表**。别名必须走 `aliasKey`。
 *
 * 历史物品自身也可能没存 `dictKey`（当时是手打的名字），所以两侧都实时解析一次再比。
 */
function findRecentByName(items: Item[], name: string, aliasKey?: AliasKeyResolver): Item | undefined {
  const target = normalizeName(name);
  if (!target) return undefined;
  const targetKey = aliasKey?.(name) ?? null;
  return recentItems(items).find((i) => {
    if (normalizeName(i.name) === target) return true;
    if (!targetKey) return false;
    const key = i.dictKey ?? aliasKey?.(i.name) ?? null;
    return key !== null && key === targetKey;
  });
}

/** 第一个启用位置；全停用时返回 `null`（调用方据此禁用入库按钮并提示） */
function firstEnabled(locations: Location[]): string | null {
  const on = locations.filter((l) => !l.deletedAt && l.enabled).sort((a, b) => a.sort - b.sort);
  return on[0]?.id ?? null;
}

/**
 * 推断入库默认值。
 *
 * 优先级（从省事到省事）：
 * - 数量：清单项自带 → 上次同名称入库的数量 → 1
 * - 单位：清单项自带 → 上次同名称的单位 → '个'
 * - 位置：清单项自带 → 上次同名称的位置 → 第一个启用位置
 *
 * 清单项自带的值来自 `planShopping`（从消耗日志继承），所以「库存 0」类建议往往已经带好了位置。
 *
 * @param aliasKey 可选的字典别名解析器，传入后「西红柿」也能命中历史里的「番茄」
 */
export function inboundDefaults(
  s: ShoppingItem,
  items: Item[],
  locations: Location[],
  aliasKey?: AliasKeyResolver,
): InboundDefaults {
  const prev = findRecentByName(items, s.name, aliasKey);
  const quantity = s.quantity && s.quantity > 0 ? s.quantity : prev?.quantity ?? 1;
  const unit = (s.unit || prev?.unit || '个').trim() || '个';
  const locationId = s.locationId ?? prev?.locationId ?? firstEnabled(locations);
  return { quantity, unit, locationId };
}

/**
 * 清单项 + 用户确认的数量位置 → `createItem` 的入参。
 *
 * 名称优先用用户实际填的名字（`overrideName`），缺省用清单项名称；
 * 品类从内置字典取，与 `stores/items.add` 保持同一套优先级，保证批量与单个入库结果一致。
 */
export function inboundInput(
  s: ShoppingItem,
  quantity: number,
  locationId: string,
  overrideName?: string | null,
): NewItemInput {
  const name = (overrideName?.trim() || s.name).trim();
  return {
    name,
    quantity: Math.max(0.5, quantity || 1),
    // 单位是必填字段：清单项没带就沿用「个」，不要写空串（写入后会显示成「2  盒」）
    unit: (s.unit || '个').trim() || '个',
    locationId,
  };
}

/** 批量入库的一行：清单项 id + 物品入参 */
export interface InboundPlanRow {
  shoppingId: string;
  input: NewItemInput;
}

/**
 * 批量入库：把若干清单项转成物品入参。
 *
 * `overrides` 供「已购 N 件全部入库」使用 —— 那些项没有逐条确认，
 * 位置统一走推断值（每项各自的历史位置 → 第一个启用位置）。
 *
 * ⚠️ 名称为空的项会被跳过并单独返回，调用方需要如实告知用户「有几项没入库」，
 * 不能静默丢弃。
 */
export function inboundInputs(
  list: ShoppingItem[],
  items: Item[],
  locations: Location[],
  opts: { overrides?: Map<string, { quantity: number; locationId: string }>; aliasKey?: AliasKeyResolver } = {},
): { rows: InboundPlanRow[]; skipped: ShoppingItem[] } {
  const rows: InboundPlanRow[] = [];
  const skipped: ShoppingItem[] = [];
  for (const s of list) {
    const name = s.name.trim();
    if (!name) {
      skipped.push(s);
      continue;
    }
    const ov = opts.overrides?.get(s.id);
    const d = inboundDefaults(s, items, locations, opts.aliasKey);
    const quantity = ov?.quantity ?? d.quantity;
    const locationId = ov?.locationId ?? d.locationId;
    // 位置为 null 说明所有位置都被停用了，无法入库
    if (!locationId) {
      skipped.push(s);
      continue;
    }
    rows.push({ shoppingId: s.id, input: inboundInput(s, quantity, locationId, name) });
  }
  return { rows, skipped };
}
