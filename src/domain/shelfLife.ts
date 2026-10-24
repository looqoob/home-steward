import type { EnvType, Item, Location, ShelfLifeSource } from './types';
import { NOT_RECOMMENDED, ENV_MAP } from './types';
import { addDays } from './dates';

export interface ResolveResult {
  days: number | typeof NOT_RECOMMENDED | null;
  source: ShelfLifeSource;
  reason: string | null;
}

/** 字典解析器：由数据层注入（需要查用户自定义表），domain 不直接依赖存储 */
export type ShelfLifeResolver = (name: string, env: EnvType) => ResolveResult;

export interface ExpiryResult {
  expireAt: string | null;
  days: number | null;
  source: ShelfLifeSource;
  notRecommended: boolean;
  reason: string | null;
  /** 若坚持存放在「不建议」环境下，按品类给出的保守天数（仅用于提示） */
  fallbackDays: number | null;
}

export interface ExpiryInput {
  name: string;
  category: Item['category'];
  storedAt: string;
  producedAt?: string | null;
  manualShelfLife?: number | null;
}

/**
 * 计算到期日。切换位置会重算（入库日期不变）。
 * 用户手填天数优先级最高，且不受位置影响。
 */
export function computeExpiry(input: ExpiryInput, env: EnvType, resolve: ShelfLifeResolver, fallback: (env: EnvType, category: Item['category']) => number | null): ExpiryResult {
  if (env === 'none') {
    return { expireAt: null, days: null, source: 'none', notRecommended: false, reason: null, fallbackDays: null };
  }

  const base = input.producedAt || input.storedAt;

  if (input.manualShelfLife && input.manualShelfLife > 0) {
    const days = Math.round(input.manualShelfLife);
    return { expireAt: addDays(base, days), days, source: 'manual', notRecommended: false, reason: null, fallbackDays: null };
  }

  const r = resolve(input.name, env);
  if (r.days === NOT_RECOMMENDED) {
    return {
      expireAt: null,
      days: null,
      source: r.source,
      notRecommended: true,
      reason: r.reason,
      fallbackDays: fallback(env, input.category),
    };
  }
  if (r.days === null || r.days <= 0) {
    return { expireAt: null, days: null, source: r.source, notRecommended: false, reason: null, fallbackDays: null };
  }

  const days = Math.round(r.days);
  return { expireAt: addDays(base, days), days, source: r.source, notRecommended: false, reason: null, fallbackDays: null };
}

/** 位置切换对比表：列出每个候选位置下的到期日 */
export interface CompareRow {
  locationId: string;
  locationName: string;
  env: EnvType;
  envLabel: string;
  expireAt: string | null;
  days: number | null;
  notRecommended: boolean;
  reason: string | null;
}

export function compareLocations(input: ExpiryInput, locations: Location[], resolve: ShelfLifeResolver, fallback: (env: EnvType, category: Item['category']) => number | null): CompareRow[] {
  return locations.map((loc) => {
    const r = computeExpiry(input, loc.env, resolve, fallback);
    return {
      locationId: loc.id,
      locationName: loc.name,
      env: loc.env,
      // 必须给「冷藏」这类文案而不是 'chilled' 枚举值 —— 字段语义是 label。
      // 此前返回枚举恰好没被直接消费才没暴露，下一个调用者会把它当真（REV-31）
      envLabel: ENV_MAP[loc.env].label,
      expireAt: r.expireAt,
      days: r.days,
      notRecommended: r.notRecommended,
      reason: r.reason,
    };
  });
}

export interface ExpiryPreviewOptions {
  /** 环境标签（如「冷藏」），提供则拼进文案；扫码/移库等只关心位置的场景可省 */
  envLabel?: string;
  /** 到期日为空时的文案。默认「未设置保质期（可到编辑页手填）」，适合入库/编辑流；
   *  移库/扫码等提示性场景传「不计入保质期」。 */
  unsetText?: string;
}

/**
 * 把 `computeExpiry` 的结果翻成给人看的三态预览文案：
 * 不建议存放（原因） / 未设置保质期 / N 天，到期日 M-D。
 *
 * 以前这段拼串在 QuickAddSheet / ScanSheet / ShoppingInboundRow /
 * LocationPickerSheet 各抄一份，措辞靠拷贝维持一致；改文案漏改某处
 * 用户就会在不同入口看到两种说法。
 */
export function expiryPreviewText(
  name: string,
  r: ExpiryResult,
  opts?: ExpiryPreviewOptions,
): string {
  const seg = opts?.envLabel ? ` · ${opts.envLabel} · ` : ' · ';
  if (r.notRecommended) return `${name}${seg}不建议存放（${r.reason}）`;
  if (!r.expireAt || !r.days) {
    return `${name}${seg}${opts?.unsetText ?? '未设置保质期（可到编辑页手填）'}`;
  }
  return `${name}${seg}${r.days} 天，到期日 ${r.expireAt.slice(5)}`;
}
