import { describe, expect, it } from 'vitest';
import { planShopping, planShoppingRetirements, DISMISS_DAYS, shoppingListText } from '../shoppingRules';
import type { ConsumeLog, ShopReason, ShoppingItem } from '../types';
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

describe('shoppingListText · 复制为文本（v1.1 F10）', () => {
  it('★ 按组输出：首行件数汇总 +【组名】+ 名称×数量单位', () => {
    const text = shoppingListText([
      { label: '冷藏', items: [mkShopping({ name: '牛奶', qty: 2, unit: '盒' })] },
      { label: '未指定位置', items: [mkShopping({ name: '抽纸', qty: 1, unit: null })] },
    ]);
    expect(text).toBe(
      ['购物清单（2 件）', '【冷藏】', '牛奶 ×2盒', '【未指定位置】', '抽纸 ×1'].join('\n'),
    );
  });

  it('数量未知的项只写名称，不带 × 与单位', () => {
    const text = shoppingListText([
      { label: '冷藏', items: [mkShopping({ name: '牛奶', qty: 2, unit: '盒' }), mkShopping({ name: '豆腐', qty: null, unit: '盒' })] },
    ]);
    expect(text).toContain('牛奶 ×2盒\n豆腐');
  });

  it('空组跳过；全部为空返回空串（调用方据此提示无可复制项）', () => {
    expect(shoppingListText([{ label: '冷藏', items: [] }])).toBe('');
    expect(shoppingListText([])).toBe('');
  });
});

describe('planShopping · 临期替换别名去重（v1.1 F15-12）', () => {
  it('★ 「番茄」「西红柿」两条批次同时 urgent：只推最早到期的那条', () => {
    const items = [
      mkItem({ id: 'tomato-b', name: '西红柿', dictKey: 'tomato', expireIn: 2, qty: 2, unit: '个', loc: 'L1' }),
      mkItem({ id: 'tomato-a', name: '番茄', dictKey: 'tomato', expireIn: 1, qty: 3, unit: '个', loc: 'L1' }),
    ];
    const out = planShopping(items, [], [], NOW);
    const near = out.filter((s) => s.reason === 'near_expiry');
    expect(near).toHaveLength(1);
    expect(near[0].sourceItemId).toBe('tomato-a');
  });

  it('同归一但无到期日的记录排在有日期的后面', () => {
    const items = [
      mkItem({ id: 'nd', name: '番茄', dictKey: 'tomato', expireIn: null, qty: 1, unit: '个', loc: 'L1' }),
      mkItem({ id: 'd', name: '西红柿', dictKey: 'tomato', expireIn: 3, qty: 1, unit: '个', loc: 'L1' }),
    ];
    const near = planShopping(items, [], [], NOW).filter((s) => s.reason === 'near_expiry');
    expect(near).toHaveLength(1);
    expect(near[0].sourceItemId).toBe('d');
  });
});

describe('planShoppingRetirements · 原因消失自动退场（v1.1 F18）', () => {
  const mkAuto = (name: string, reason: ShopReason, over: Partial<ShoppingItem> = {}): ShoppingItem => ({
    ...mkShopping({ name }),
    reason,
    auto: true,
    checked: false,
    ...over,
  });

  it('★ 建议集里没有它 → 退场（原因消失的牛奶行）', () => {
    const existing = [mkAuto('牛奶', 'near_expiry'), mkAuto('酸奶', 'near_expiry')];
    const out = planShoppingRetirements(existing, [
      { name: '酸奶', reason: 'near_expiry', why: '', sourceItemId: 'x', locationId: null, unit: null, quantity: null },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]).toBe(existing[0].id);
  });

  it('手动项 / 已勾选 / 已入库 / 已软删的行永不退场', () => {
    const existing = [
      mkAuto('牛奶', 'near_expiry', { auto: false }),
      mkAuto('牛奶', 'near_expiry', { checked: true }),
      mkAuto('牛奶', 'near_expiry', { inboundItemId: 'i1' }),
      mkAuto('牛奶', 'near_expiry', { deletedAt: NOW }),
    ];
    expect(planShoppingRetirements(existing, [])).toHaveLength(0);
  });

  it('同名不同 reason 不互抵：临期建议消失但库存 0 建议在场 → 不退', () => {
    const existing = [mkAuto('牛奶', 'near_expiry')];
    const out = planShoppingRetirements(existing, [
      { name: '牛奶', reason: 'out_of_stock', why: '', sourceItemId: null, locationId: null, unit: null, quantity: null },
    ]);
    expect(out).toHaveLength(1);
  });
});
