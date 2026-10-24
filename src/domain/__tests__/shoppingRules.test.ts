import { describe, expect, it } from 'vitest';
import { planShopping, DISMISS_DAYS } from '../shoppingRules';
import type { ConsumeLog, ShoppingItem } from '../types';
import { mkItem, mkShopping, NOW } from './fixtures';

const DAY = 86_400_000;

function mkLog(s: Partial<ConsumeLog> & { at: number }): ConsumeLog {
  return {
    id: s.id ?? `l${s.at}`,
    itemId: s.itemId ?? 'i1',
    name: s.name ?? '牛奶',
    quantity: s.quantity ?? 1,
    unit: s.unit ?? '盒',
    locationId: s.locationId ?? 'L1',
    type: s.type ?? 'consumed',
    price: s.price ?? null,
    unitPrice: s.unitPrice ?? null,
    expireAt: s.expireAt ?? null,
    overdueDays: null,
    at: s.at,
    createdAt: s.at,
    deletedAt: s.deletedAt ?? null,
  };
}

/** 造一条「已软删除」的清单项（REV-43 的抑制依据就住在这类行里） */
function dismissedRow(name: string, reason: ShoppingItem['reason'], opts: { dismissedUntil?: number; deletedAt?: number } = {}): ShoppingItem {
  return {
    ...mkShopping({ name }),
    reason,
    auto: true,
    deletedAt: opts.deletedAt ?? NOW - DAY,
    dismissedUntil: opts.dismissedUntil ?? NOW + DISMISS_DAYS * DAY,
  };
}

describe('planShopping · 忽略抑制（REV-43）', () => {
  // 「库存 0」规则：近 60 天消耗过、当前无在库
  const makeLogs = () => [mkLog({ name: '牛奶', type: 'consumed', at: NOW - DAY })];

  it('★ 软删除行带 dismissedUntil（未到期）→ 同名建议不重生', () => {
    const out = planShopping([], makeLogs(), [dismissedRow('牛奶', 'out_of_stock')], NOW);
    expect(out.filter((s) => s.reason === 'out_of_stock' && s.name === '牛奶')).toHaveLength(0);
  });

  it('★ 早期数据没写 dismissedUntil：deletedAt 距今 < 7 天同样抑制', () => {
    const row = dismissedRow('牛奶', 'out_of_stock', { dismissedUntil: undefined, deletedAt: NOW - 2 * DAY });
    const out = planShopping([], makeLogs(), [row], NOW);
    expect(out.filter((s) => s.name === '牛奶')).toHaveLength(0);
  });

  it('★ dismissedUntil 已过期 → 建议重新出现（7 天抑制是暂时的，不是永久拉黑）', () => {
    const row = dismissedRow('牛奶', 'out_of_stock', { dismissedUntil: NOW - 1, deletedAt: NOW - 10 * DAY });
    const out = planShopping([], makeLogs(), [row], NOW);
    expect(out.some((s) => s.name === '牛奶' && s.reason === 'out_of_stock')).toBe(true);
  });

  it('抑制按 reason 分开：忽略「库存 0」不挡「易浪费」的同类建议', () => {
    const logs = [
      ...makeLogs(),
      mkLog({ name: '牛奶', type: 'wasted', at: NOW - DAY }),
      mkLog({ name: '牛奶', type: 'wasted', at: NOW - 3 * DAY }),
    ];
    const out = planShopping([], logs, [dismissedRow('牛奶', 'out_of_stock')], NOW);
    expect(out.some((s) => s.name === '牛奶' && s.reason === 'frequent_waste')).toBe(true);
    expect(out.some((s) => s.name === '牛奶' && s.reason === 'out_of_stock')).toBe(false);
  });

  it('未删除的同名建议挡住重复生成（幂等）', () => {
    const alive = { ...mkShopping({ name: '牛奶' }), reason: 'out_of_stock' as const };
    const out = planShopping([], makeLogs(), [alive], NOW);
    expect(out.filter((s) => s.name === '牛奶' && s.reason === 'out_of_stock')).toHaveLength(0);
  });

  it('DISMISS_DAYS 是唯一时长定义（改它要连带审 UI 文案「7 天」）', () => {
    expect(DISMISS_DAYS).toBe(7);
  });
});

describe('planShopping · 归一化聚合（REV-47）', () => {
  it('★ 「番茄」与「番茄（西红柿）」是同一件东西：只推一条库存 0 建议', () => {
    const logs = [
      mkLog({ name: '番茄', type: 'consumed', at: NOW - DAY }),
      mkLog({ name: '番茄（西红柿）', type: 'consumed', at: NOW - 2 * DAY }),
    ];
    const out = planShopping([], logs, [], NOW);
    expect(out.filter((s) => s.reason === 'out_of_stock')).toHaveLength(1);
  });

  it('★ 库存里有「番茄」时，「番茄（西红柿）」的消耗记录不再触发库存 0 推荐', () => {
    const items = [mkItem({ name: '番茄', loc: 'L1' })];
    const logs = [mkLog({ name: '番茄（西红柿）', type: 'consumed', at: NOW - DAY })];
    const out = planShopping(items, logs, [], NOW);
    expect(out.filter((s) => s.reason === 'out_of_stock')).toHaveLength(0);
  });
});

describe('planShopping · 时间窗（REV-45）', () => {
  it('★ 未来时间戳（时钟跳变）不算「最近消耗过」', () => {
    const logs = [mkLog({ name: '牛奶', type: 'consumed', at: NOW + 10 * DAY })];
    expect(planShopping([], logs, [], NOW)).toHaveLength(0);
  });

  it('60 天窗口外的消耗不触发库存 0', () => {
    const logs = [mkLog({ name: '牛奶', type: 'consumed', at: NOW - 61 * DAY })];
    expect(planShopping([], logs, [], NOW)).toHaveLength(0);
  });
});
