import type { ConsumeLog, Item, Location, ShopReason, ShoppingItem, Settings } from './types';
import { freshnessOf } from './freshness';
import { todayStr } from './dates';
import { normalizeName } from './normalize';

export interface Suggestion {
  name: string;
  reason: ShopReason;
  why: string;
  sourceItemId: string | null;
  locationId: string | null;
  unit: string | null;
  /**
   * 建议数量。用于清单一键入库时预填 —— 用户上次买了 2 盒，这次大概率也是 2 盒。
   * 规则只能从日志推断「曾消耗过多少」，拿不到精确采购量，所以给 `null` 表示「未知」。
   */
  quantity: number | null;
}

const DAY = 24 * 60 * 60 * 1000;

/**
 * 「忽略自动建议」的抑制天数：被删掉的自动项在这个天数内不会重生。
 *
 * ⚠️ 这是**唯一**的时长定义：`stores/shopping` 的抑制时长由它换算而来，
 * 不要在别处再写一个 `7`——两处数字一旦分叉，「页面上说 7 天、实际 3 天」这种
 * 信任问题就出现了（REV-43）。
 */
export const DISMISS_DAYS = 7;

function activeItems(items: Item[]): Item[] {
  return items.filter((i) => !i.deletedAt && i.status === 'in_stock');
}

/** 事件时间戳合法且不晚于 now：时钟跳变产生的未来时间戳不参与「最近消耗」判断 */
function inWindow(at: unknown, now: number, days: number): boolean {
  return typeof at === 'number' && Number.isFinite(at) && at > 0 && at <= now && now - at <= days * DAY;
}

/**
 * 名称（归一键）→ 最近一次「用掉」的数量。
 *
 * 用途是给清单一键入库预填数量：上次买了 2 盒，这次大概率也是 2 盒。
 * 取的是**消耗**日志而非入库记录 —— 消耗日志更可能接近真实采购量
 * （买了 10 个鸡蛋分 4 次吃完，最后一次是 3，不够准但优于直接给 1）。
 *
 * 键走 `normalizeName`：「番茄（西红柿）」与「番茄」的消耗量是同一件东西的（REV-47）。
 */
function lastConsumedQty(logs: ConsumeLog[], now: number): Map<string, number> {
  const latest = new Map<string, { at: number; qty: number }>();
  for (const l of logs) {
    if (l.deletedAt || l.type !== 'consumed' || !inWindow(l.at, now, 60)) continue;
    const k = normalizeName(l.name);
    const prev = latest.get(k);
    if (!prev || l.at >= prev.at) latest.set(k, { at: l.at, qty: l.quantity });
  }
  const out = new Map<string, number>();
  for (const [k, v] of latest) out.set(k, v.qty);
  return out;
}

/**
 * 自动生成购物建议（幂等：反复调用不产生重复项）。
 * 规则：① 近 60 天消耗过但当前无在库 → 库存 0
 *      ② 当前处于紧急/已过期 → 临期替换
 *      ③ 近 90 天丢弃 ≥ 2 次 → 易浪费
 *
 * @param existing **必须传含软删除行的全量清单**（`ShoppingRepository.allIncludingDeleted()`）。
 *   软删除行是「忽略 7 天」抑制的唯一依据 —— 传 `all()` 过滤后的列表会让 dismissed
 *   集合恒为空，「忽略的建议下次启动又冒出来」（REV-43）。
 */
export function planShopping(
  items: Item[],
  logs: ConsumeLog[],
  existing: ShoppingItem[],
  now: number = Date.now(),
  settings: Pick<Settings, 'soonDays' | 'urgentDays'> = { soonDays: 14, urgentDays: 3 },
): Suggestion[] {
  const today = todayStr(now);
  const live = activeItems(items);
  const logs60 = logs.filter((l) => !l.deletedAt && l.type === 'consumed' && inWindow(l.at, now, 60));
  const logs90 = logs.filter((l) => !l.deletedAt && l.type === 'wasted' && inWindow(l.at, now, 90));
  const lastQty = lastConsumedQty(logs, now);

  const out: Suggestion[] = [];
  const seen = new Set<string>();

  const push = (s: Suggestion) => {
    // 幂等键走归一名：「番茄」与「番茄（西红柿）」不各推一条（REV-47）
    const key = `${normalizeName(s.name)}|${s.reason}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(s);
  };

  // ① 库存 0（在库名单同样走归一键，否则「库存里有番茄」挡不住「西红柿」的推荐）
  const inStockNames = new Set(live.map((i) => normalizeName(i.name)));
  for (const l of logs60) {
    if (inStockNames.has(normalizeName(l.name))) continue;
    push({ name: l.name, reason: 'out_of_stock', why: '库存 0', sourceItemId: null, locationId: l.locationId, unit: l.unit, quantity: lastQty.get(normalizeName(l.name)) ?? null });
  }

  // ② 临期替换：只对 urgent（临期）建议替换，over（已过期）不推送 1:1 采购——
  // 东西还在冰箱里没扔就建议「再买 N 个」会误导重复采购。
  // v1.1 F15-12：按**折叠键**去重——「番茄」「西红柿」是两条独立批次记录（折叠只在展示层），
  // 同时 urgent 会各推一条同义建议；只保留最早到期那份（FEFO 的建议才最该买）。
  // 键与 foldKeyOf 同源：(dictKey ?? name) 过 normalizeName——别名聚合靠 dictKey
  // （入库时已写成字典规范词根），domain 拿不到 aliasKey，旧数据 dictKey 为 null 时退字面归一
  // （与折叠的兜底口径一致，坑位 #66 的边界在此同样适用）。
  {
    const urgentByName = new Map<string, Item>();
    for (const it of live) {
      if (freshnessOf(it, today, settings).state !== 'urgent') continue;
      const k = normalizeName(it.dictKey ?? it.name);
      const cur = urgentByName.get(k);
      // 无到期日排最后（与 sortByFreshness 同口径：有日期在前）
      if (!cur || (it.expireAt && (!cur.expireAt || it.expireAt < cur.expireAt))) urgentByName.set(k, it);
    }
    for (const it of urgentByName.values()) {
      push({ name: it.name, reason: 'near_expiry', why: '临期替换', sourceItemId: it.id, locationId: it.locationId, unit: it.unit, quantity: it.quantity });
    }
  }

  // ③ 易浪费
  const wasteCount = new Map<string, number>();
  for (const l of logs90) {
    const k = normalizeName(l.name);
    wasteCount.set(k, (wasteCount.get(k) ?? 0) + 1);
  }
  for (const [k, cnt] of wasteCount) {
    if (cnt >= 2) {
      // 展示名用该归一键下最近一条日志的原名（k 只是归一键，可能不是用户输入过的写法）
      const display = logs90.find((l) => normalizeName(l.name) === k)?.name ?? k;
      push({ name: display, reason: 'frequent_waste', why: `近 90 天扔掉 ${cnt} 次 · 建议少买`, sourceItemId: null, locationId: null, unit: null, quantity: lastQty.get(k) ?? null });
    }
  }

  // 幂等过滤：已存在同 name+reason 的未删除项跳过；
  // 被手动删除的自动项在 DISMISS_DAYS 内不重生（软删除行带 dismissedUntil；
  // 早期数据没写 dismissedUntil 的，用 deletedAt 距今是否超过抑制期兜底）
  const exists = new Set(
    existing.filter((e) => !e.deletedAt).map((e) => `${normalizeName(e.name)}|${e.reason}`),
  );
  const dismissed = new Set(
    existing
      .filter((e) => {
        if (!e.deletedAt) return false;
        if (typeof e.dismissedUntil === 'number' && Number.isFinite(e.dismissedUntil) && e.dismissedUntil > now) return true;
        return now - e.deletedAt < DISMISS_DAYS * DAY;
      })
      .map((e) => `${normalizeName(e.name)}|${e.reason}`),
  );

  return out.filter((s) => {
    const key = `${normalizeName(s.name)}|${s.reason}`;
    return !exists.has(key) && !dismissed.has(key);
  });
}

export const REASON_LABEL: Record<ShopReason, string> = {
  // v1.1 F15-6：组名用名词短语——「库存 0」作为清单分组头时与计数连读成「库存 0 1」，语义断裂
  out_of_stock: '没库存了',
  near_expiry: '临期替换',
  frequent_waste: '易浪费',
  manual: '手动添加',
};

/* ==================== 清单按位置分组 ==================== */

export interface ShopLocationGroup {
  /** 位置 id；未指定 / 位置已停用时为 `null` */
  locationId: string | null;
  label: string;
  items: ShoppingItem[];
}

/**
 * 未指定位置的分组 id。
 *
 * ⚠️ 源码里必须写**转义序列** `'\u0000none'`，不能内嵌真实的 NUL 字节：
 * git 会把含 NUL 的文件当成二进制，`git diff` / 内容搜索 / review 全部失效
 * （REV-36 踩过）。运行时两者是完全相同的字符串，行为零变化。
 */
export const NO_LOCATION = '\u0000none';

/**
 * 清单按存放位置分组。
 *
 * 组顺序**跟随「位置管理」里的顺序**（`locations` 已按 `sort` 排好），
 * 等于把自己的逛店动线直接用起来：先买要放冷藏的，再买放干燥的。
 * 「未指定」永远排最后 —— 它是「还没决定放哪」，不该抢在真实位置前面。
 *
 * ⚠️ 已停用 / 已删除的位置**不单独成组**，其中的项归入「未指定」：
 * 位置管理里把它藏起来了，清单里再单列一组只会让用户去找一个找不到的柜子。
 *
 * @param list 清单项（调用方先过滤掉 `deletedAt`）
 * @param locations 位置列表，需已按 `sort` 升序
 * @example groupShoppingByLocation(shopping.visible, locations.all)
 */
export function groupShoppingByLocation(
  list: ShoppingItem[],
  locations: Location[],
): ShopLocationGroup[] {
  const live = new Map<string, string>();
  for (const l of locations) {
    if (l.deletedAt || !l.enabled) continue;
    live.set(l.id, l.name);
  }
  const buckets = new Map<string, ShoppingItem[]>();
  for (const s of list) {
    const key = s.locationId && live.has(s.locationId) ? s.locationId : NO_LOCATION;
    const arr = buckets.get(key);
    if (arr) arr.push(s);
    else buckets.set(key, [s]);
  }
  const out: ShopLocationGroup[] = [];
  for (const l of locations) {
    const items = buckets.get(l.id);
    if (items?.length) out.push({ locationId: l.id, label: l.name, items });
  }
  const rest = buckets.get(NO_LOCATION);
  if (rest?.length) out.push({ locationId: null, label: '未指定位置', items: rest });
  return out;
}

/* ==================== 清单复制为文本 ==================== */

/**
 * 把清单分组导出为可分享的纯文本（v1.1 F10）。
 *
 * 家人没装 App 时，这是把清单「发出去」的唯一通道（纯文本，微信 / 短信都能贴）。
 * 只做格式化不做过滤：喂什么就排什么，调用方决定传未勾选的（要买的）还是全量。
 *
 * @param groups 已分组的清单（`groupShoppingByLocation` 的产出，或按原因分组的同形结构）
 * @returns 首行「购物清单（N 件）」，其后每组一个【标签】头 + 逐行「名称 ×数量单位」；
 *          没有任何条目时返回空串（调用方据此提示「没有可复制的项」）
 * @example
 * const text = shoppingListText(groupShoppingByLocation(shopping.pending, locations.all));
 * if (text) await copyToClipboard(text);
 */
export function shoppingListText(groups: { label: string; items: ShoppingItem[] }[]): string {
  const parts: string[] = [];
  let total = 0;
  for (const g of groups) {
    if (!g.items.length) continue;
    total += g.items.length;
    parts.push(`【${g.label}】`);
    for (const s of g.items) {
      const qty =
        s.quantity !== null && s.quantity > 0 ? ` ×${s.quantity}${s.unit ?? ''}` : '';
      parts.push(`${s.name}${qty}`);
    }
  }
  if (!total) return '';
  return [`购物清单（${total} 件）`, ...parts].join('\n');
}
