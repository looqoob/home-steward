/**
 * 「同名折叠」的分组与 FEFO 消耗（纯函数）。
 *
 * ## 为什么不真合并
 *
 * 两份牛奶，10-08 与 10-15 到期。合并成一行就必然要丢掉「哪一份先过期」，
 * 而这恰恰是避免浪费的唯一依据：取最近 → 10-15 那份被提前判过期、你会扔掉还能喝的；
 * 取最早 → 10-08 那份被「续命」、该扔的时候 App 不提醒。
 *
 * 所以本模块的立场是：**数据层一条记录 = 一个批次，永不合并**；
 * 只在**展示层**把同名同位置的折叠成一张组卡，消耗时按 FEFO（先到期先出）选份。
 *
 * 到期日相同（或相差 ≤ 1 天）的两份在**入库时**可以直接数量相加——那种情况
 * 折叠后与合并对用户完全无感，不值得为它保留两行。见 `findMergeTarget`。
 */

import type { ConsumeLog, ConsumeType, Item } from './types';
import { normalizeName } from './normalize';
import { diffDays } from './dates';
import { buildConsumeLog } from './bulk';
import type { AliasKeyResolver } from './inbound';

/** 一组同名同位置的物品 */
export interface ItemGroup {
  /** `${locationId}|${名称键}`，同键即同组 */
  key: string;
  /** 展示名：取组内**最早到期**那份的名字（与徽标、排序口径一致，不会出现「名字是 B、颜色按 A」） */
  name: string;
  icon: string;
  unit: string;
  locationId: string;
  /** FEFO 排好序的成员，`[0]` 最早到期 */
  members: Item[];
  /** 代表份：`members[0]`，组卡的状态色 / 排序 / 进度条都看它 */
  lead: Item;
  /** 组合计数量 */
  totalQuantity: number;
  /** 是否每一份都有到期日（无到期日的排在 FEFO 末位） */
  allDated: boolean;
}

/**
 * 折叠键 = `位置 + 名称`。
 *
 * ⚠️ **必须带位置**：冰箱里的和阳台上的同名物品是两回事，并成一张卡会让用户
 * 在错误的柜子里找东西。同位置的判断交给调用方传 `aliasKey`（字典别名）。
 *
 * 名称键优先用 `item.dictKey`（入库时定格，之后字典改名也不会漂移），
 * 没有再实时解析别名，最后才退到纯字面归一（自定义食材没有字典条目）。
 */
export function foldKeyOf(item: Item, aliasKey?: AliasKeyResolver): string {
  const nameKey = item.dictKey ?? aliasKey?.(item.name) ?? normalizeName(item.name);
  return `${item.locationId}|${nameKey}`;
}

/**
 * FEFO 比较：到期日升序，**无到期日的排最后**；同一天则按入库时刻升序（先进先出）。
 *
 * 为什么要这个次序：消耗默认扣最早到期的那份，所以展开后第一行就是「下一份该吃的」，
 * 用户核对起来是自上而下的。
 */
export function fefoCompare(a: Item, b: Item): number {
  const ax = a.expireAt;
  const bx = b.expireAt;
  if (ax !== bx) {
    if (ax === null) return 1;
    if (bx === null) return -1;
    return ax < bx ? -1 : 1;
  }
  return a.createdAt - b.createdAt;
}

/** 组内排序 */
export function sortFefo(items: Item[]): Item[] {
  return [...items].sort(fefoCompare);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * 把在库物品折叠成组。
 *
 * - 传入的列表会先过滤掉已删除 / 已用完的（组里不该出现「已用完的牛奶」）；
 * - 组内按 FEFO 排，组间按 `lead` 的到期日升序、无到期日的排最后；
 * - 组间同名时用名称兜底排序，保证渲染顺序稳定（否则每次 `load()` 卡片会跳位）。
 *
 * @param items 全量物品（通常是筛选后的结果）
 * @param aliasKey 字典别名解析器，由调用方传 `data/dict` 的 `foodKeyOf`
 * @example foldItems(items, foodKeyOf)
 */
export function foldItems(items: Item[], aliasKey?: AliasKeyResolver): ItemGroup[] {
  const live = items.filter((i) => !i.deletedAt && i.status === 'in_stock');
  const buckets = new Map<string, Item[]>();
  for (const it of live) {
    const key = foldKeyOf(it, aliasKey);
    const arr = buckets.get(key);
    if (arr) arr.push(it);
    else buckets.set(key, [it]);
  }
  const groups: ItemGroup[] = [];
  for (const [key, members] of buckets) {
    const sorted = sortFefo(members);
    const lead = sorted[0] as Item;
    groups.push({
      key,
      name: lead.name,
      icon: lead.icon || Array.from(lead.name)[0] || '?',
      unit: lead.unit,
      locationId: lead.locationId,
      members: sorted,
      lead,
      totalQuantity: round2(sorted.reduce((s, m) => s + m.quantity, 0)),
      allDated: sorted.every((m) => m.expireAt !== null),
    });
  }
  return groups.sort((a, b) => {
    const ax = a.lead.expireAt;
    const bx = b.lead.expireAt;
    if (ax !== bx) {
      if (ax === null) return 1;
      if (bx === null) return -1;
      return ax < bx ? -1 : 1;
    }
    return a.name.localeCompare(b.name, 'zh-Hans-CN');
  });
}

/** FEFO 分配结果：从哪一份取多少 */
export interface FefoSlice {
  item: Item;
  take: number;
}

/**
 * 按 FEFO 顺序把 `qty` 拆到各份上。
 *
 * 数量不足时**只分配到有的为止**（返回的 `take` 合计可能小于 `qty`），
 * 调用方要按实际返回值写日志，不要假设分满了。
 * @example fefoSlices([a过期早, b过期晚], 3) // → [{item:a, take:1}, {item:b, take:2}]
 */
export function fefoSlices(members: Item[], qty: number): FefoSlice[] {
  let left = round2(qty);
  const out: FefoSlice[] = [];
  for (const m of sortFefo(members)) {
    if (left <= 0) break;
    if (m.quantity <= 0) continue;
    const take = round2(Math.min(m.quantity, left));
    if (take <= 0) continue;
    out.push({ item: m, take });
    left = round2(left - take);
  }
  return out;
}

export interface GroupConsumePlan {
  logs: ConsumeLog[];
  items: Item[];
}

/**
 * 规划「从一组的 N 份里消耗 qty」：按 FEFO 依次扣，跨份顺延。
 *
 * 语义与 `planBulkConsume` / `stores.items.consume` 完全一致：
 * 某份被取完 → `status = 'finished'` 且 `quantity` **保留原值**（供日志对账、撤销时回加）；
 * 只取一部分 → 扣减 `quantity`、状态仍为 `in_stock`。
 */
export function planGroupConsume(
  members: Item[],
  qty: number,
  type: ConsumeType,
  now: number = Date.now(),
): GroupConsumePlan {
  const fromEpochStr = new Date(now);
  const today = `${fromEpochStr.getFullYear()}-${String(fromEpochStr.getMonth() + 1).padStart(2, '0')}-${String(fromEpochStr.getDate()).padStart(2, '0')}`;
  const logs: ConsumeLog[] = [];
  const out: Item[] = [];
  for (const s of fefoSlices(members, qty)) {
    logs.push(buildConsumeLog(s.item, type, s.take, today, now));
    out.push(
      s.take >= s.item.quantity
        ? { ...s.item, status: 'finished', updatedAt: now }
        : { ...s.item, quantity: round2(s.item.quantity - s.take), updatedAt: now },
    );
  }
  return { logs, items: out };
}

/**
 * 两份物品能否**无损合并**（数量相加不丢信息）。
 *
 * 判据：同名同位置，且到期日**都为空**或**相差 ≤ 1 天**。
 * 差 1 天算「同一天」是因为日期是用户手填的，`10-08` 与 `10-09` 差一天
 * 在实际场景里就是同一批；而差 3 天就该让用户自己看清两行。
 */
export function expiryCompatible(a: string | null, b: string | null): boolean {
  if (a === null && b === null) return true;
  if (a === null || b === null) return false;
  return Math.abs(diffDays(a, b)) <= 1;
}

/**
 * 为「新建的物品」找一个可以数量相加的既有记录。
 *
 * 找不到返回 `undefined` —— 调用方照常新建行。**这不是错误路径**：
 * 大多数入库都命中不了合并，命中不了就多一行，折叠后用户看不出来。
 *
 * ⚠️ 传进来的 `items` 应为**落库前**的既有列表；`created` 是刚算出来、还没写库的物品。
 * @example const target = findMergeTarget(created, items.list, foodKeyOf)
 */
export function findMergeTarget(
  created: Item,
  items: Item[],
  aliasKey?: AliasKeyResolver,
): Item | undefined {
  const key = foldKeyOf(created, aliasKey);
  return items.find(
    (i) => !i.deletedAt && i.status === 'in_stock' && foldKeyOf(i, aliasKey) === key && expiryCompatible(i.expireAt, created.expireAt),
  );
}
