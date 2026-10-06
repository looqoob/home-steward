import { describe, expect, it } from 'vitest';
import { categoryDistribution, topWasted, turnoverDays, wasteTrend, stockValue, MIN_TREND_MONTHS, MIN_TURNOVER_SAMPLES } from '../stats';
import type { ConsumeLog } from '../types';
import { mkItem, NOW, TODAY, ds } from './fixtures';

const DAY = 86_400_000;
/** 造一条日志，只需测试关心的字段 */
function mkLog(s: Partial<ConsumeLog> & { at: number }): ConsumeLog {
  return {
    id: s.id ?? `l${s.at}`,
    itemId: s.itemId ?? 'i1',
    name: s.name ?? '测试物资',
    quantity: s.quantity ?? 1,
    unit: s.unit ?? '个',
    locationId: s.locationId ?? 'L1',
    type: s.type ?? 'wasted',
    price: s.price ?? null,
    unitPrice: s.unitPrice ?? null,
    expireAt: s.expireAt ?? null,
    overdueDays: s.overdueDays ?? null,
    at: s.at,
    createdAt: s.at,
    deletedAt: s.deletedAt ?? null,
  };
}

describe('wasteTrend', () => {
  it('样本不足 → 空数组（宁可不说，也不拿 1 笔数据画 6 个月趋势）', () => {
    const logs = [mkLog({ at: NOW, price: 10 })];
    expect(wasteTrend(logs, 6, NOW)).toEqual([]);
    expect(MIN_TREND_MONTHS).toBe(2);
  });

  it('够 2 个月就有数据，且缺失的月份补 0（折线要连续）', () => {
    // NOW = 2026-10-05，上月取 09-30，再往前一个月取 08-31。
    // ⚠️ 别用 `ds(-35)` 去找「9 月」：10-05 减 35 天是 8-31，会落进 8 月桶。
    const logs = [
      mkLog({ at: Date.parse(`${ds(0)}T10:00:00`), price: 10, quantity: 1 }),
      mkLog({ at: Date.parse(`${ds(-5)}T10:00:00`), price: 20, quantity: 2 }),
    ];
    const t = wasteTrend(logs, 6, NOW);
    expect(t).toHaveLength(6);
    const may = t.find((x) => x.month === '2026-05')!;
    expect(may).toMatchObject({ amount: 0, count: 0, label: '5月' });
    const sep = t.find((x) => x.month === '2026-09')!;
    expect(sep.amount).toBe(20);
    expect(sep.count).toBe(2);
    expect(t[t.length - 1]!.month).toBe('2026-10');
  });

  it('只统计 wasted，consumed 不计入浪费', () => {
    // ⚠️ 趋势要求「至少 2 个月有浪费数据」才返回结果，所以 9 月、8 月各给一条 wasted，
    // 10 月只放一条 consumed —— 它的金额必须是 0。
    const logs = [
      mkLog({ at: Date.parse(`${ds(0)}T10:00:00`), price: 10, type: 'consumed' }),
      mkLog({ at: Date.parse(`${ds(-5)}T10:00:00`), price: 20, type: 'wasted' }),
      mkLog({ at: Date.parse(`${ds(-35)}T10:00:00`), price: 30, type: 'wasted' }),
    ];
    const t = wasteTrend(logs, 6, NOW);
    expect(t.find((x) => x.month === '2026-10')!.amount).toBe(0);
    expect(t.find((x) => x.month === '2026-09')!.amount).toBe(20);
    expect(t.find((x) => x.month === '2026-08')!.amount).toBe(30);
  });

  it('已删除的日志不计入', () => {
    const logs = [
      mkLog({ at: Date.parse(`${ds(0)}T10:00:00`), price: 10, deletedAt: NOW }),
      mkLog({ at: Date.parse(`${ds(-5)}T10:00:00`), price: 20 }),
      mkLog({ at: Date.parse(`${ds(-35)}T10:00:00`), price: 30 }),
    ];
    const t = wasteTrend(logs, 6, NOW);
    expect(t.find((x) => x.month === '2026-10')!.amount).toBe(0);
    expect(t.find((x) => x.month === '2026-09')!.amount).toBe(20);
  });

  it('把 10 月那条删掉后就只剩 1 个月 → 样本不足，返回空数组', () => {
    const logs = [
      mkLog({ at: Date.parse(`${ds(0)}T10:00:00`), price: 10, deletedAt: NOW }),
      mkLog({ at: Date.parse(`${ds(-5)}T10:00:00`), price: 20 }),
    ];
    expect(wasteTrend(logs, 6, NOW)).toEqual([]);
  });

  it('窗口外的日志不计入（半年前的浪费不该出现在近 6 个月）', () => {
    const logs = [
      mkLog({ at: Date.parse(`${ds(0)}T10:00:00`), price: 10 }),
      mkLog({ at: Date.parse(`${ds(-200)}T10:00:00`), price: 99 }),
    ];
    // 窗口内只有 1 个月 → 样本不足，直接返回空
    expect(wasteTrend(logs, 6, NOW)).toEqual([]);
  });
});

describe('topWasted', () => {
  it('按累计金额降序', () => {
    const logs = [
      mkLog({ name: '牛奶', at: NOW, price: 12, quantity: 1 }),
      mkLog({ name: '牛奶', at: NOW - DAY, price: 8, quantity: 1 }),
      mkLog({ name: '青菜', at: NOW, price: 5, quantity: 3 }),
    ];
    const top = topWasted(logs, 5);
    expect(top[0]).toEqual({ name: '牛奶', count: 2, amount: 20 });
    expect(top[1]!.name).toBe('青菜');
  });

  it('全都没填价格时退化为按数量排（仍返回有用顺序，而不是随机）', () => {
    const logs = [
      mkLog({ name: '青菜', at: NOW, price: null, quantity: 3 }),
      mkLog({ name: '牛奶', at: NOW, price: null, quantity: 9 }),
    ];
    expect(topWasted(logs, 5).map((t) => t.name)).toEqual(['牛奶', '青菜']);
  });

  it('没有浪费记录 → 空数组', () => {
    expect(topWasted([])).toEqual([]);
  });

  it('n 生效', () => {
    const logs = ['a', 'b', 'c'].map((n, i) => mkLog({ name: n, at: NOW - i * DAY, price: 10 - i }));
    expect(topWasted(logs, 2)).toHaveLength(2);
  });

  it('★ 脏价格（字符串 / 负数）计 0，不能把累计金额污染成 NaN', () => {
    // 直接 `+=` 字符串会做拼接（"5" + 5 = "55"），金额变成字符串后再 round2 就是 NaN
    const dirty = [
      mkLog({ name: '青菜', at: NOW, price: '5' as unknown as number, quantity: 1 }),
      mkLog({ name: '青菜', at: NOW - DAY, price: -20, quantity: 1 }),
      mkLog({ name: '青菜', at: NOW - 2 * DAY, price: 7, quantity: 1 }),
    ];
    const top = topWasted(dirty, 5);
    expect(top[0]).toEqual({ name: '青菜', count: 3, amount: 7 });
    expect(Number.isFinite(top[0]!.amount)).toBe(true);
  });
});

describe('turnoverDays', () => {
  it('样本不足 → null', () => {
    const items = [mkItem({ id: 'a' })];
    const logs = [mkLog({ itemId: 'a', type: 'consumed', at: Date.parse(`${ds(5)}T10:00:00`) })];
    expect(turnoverDays(items, logs)).toBeNull();
    expect(MIN_TURNOVER_SAMPLES).toBe(5);
  });

  it('够样本时取「入库 → 第一次消耗」的平均天数', () => {
    // 5 件，每件入库日 = TODAY，第 i 件在 i 天后被消耗
    const items = Array.from({ length: 5 }, (_, i) => mkItem({ id: `i${i}`, storedAt: TODAY }));
    const logs = items.map((it, i) =>
      mkLog({ itemId: it.id, type: 'consumed', at: Date.parse(`${ds(i + 1)}T10:00:00`) }),
    );
    // (1+2+3+4+5)/5 = 3
    expect(turnoverDays(items, logs)).toBe(3);
  });

  it('多次消耗只取第一次（否则算的是消耗周期，不是周转速度）', () => {
    const items = Array.from({ length: 5 }, (_, i) => mkItem({ id: `i${i}`, storedAt: TODAY }));
    const logs = [
      ...items.map((it, i) => mkLog({ itemId: it.id, type: 'consumed', at: Date.parse(`${ds(2)}T09:00:00`) })),
      ...items.map((it) => mkLog({ itemId: it.id, type: 'consumed', at: Date.parse(`${ds(30)}T09:00:00`) })),
    ];
    expect(turnoverDays(items, logs)).toBe(2);
  });

  it('补录导致的负间隔被跳过，不会把平均值拉成负数', () => {
    // 6 件：第 0 件的消耗日志早于入库日（事后补录），其余 5 件都是 4 天
    const items = Array.from({ length: 6 }, (_, i) => mkItem({ id: `i${i}`, storedAt: TODAY }));
    const logs = items.map((it, i) =>
      mkLog({ itemId: it.id, type: 'consumed', at: Date.parse(`${ds(i === 0 ? -3 : 4)}T10:00:00`) }),
    );
    // 负的那条被丢掉，剩 5 条各 4 天 → 刚好够下限，平均仍是 4
    expect(turnoverDays(items, logs)).toBe(4);
  });
});

describe('categoryDistribution', () => {
  it('按数量降序，百分比之和为 1', () => {
    const items = [
      mkItem({ id: 'a', category: 'vegetable' }),
      mkItem({ id: 'b', category: 'vegetable' }),
      mkItem({ id: 'c', category: 'fruit' }),
    ];
    const d = categoryDistribution(items);
    expect(d[0]).toMatchObject({ category: 'vegetable', count: 2, label: '蔬菜' });
    expect(d.reduce((s, x) => s + x.percent, 0)).toBeCloseTo(1, 5);
  });

  it('无品类的归到「其他」，不从统计里消失', () => {
    const d = categoryDistribution([mkItem({ id: 'a', category: null })]);
    expect(d).toEqual([{ category: 'other', label: '其他', count: 1, percent: 1 }]);
  });

  it('已用完 / 已删除的不计入（与「位置分布」口径一致）', () => {
    const d = categoryDistribution([
      mkItem({ id: 'a', category: 'fruit' }),
      mkItem({ id: 'b', category: 'fruit', status: 'finished' }),
      mkItem({ id: 'c', category: 'fruit', deletedAt: NOW }),
    ]);
    expect(d[0]!.count).toBe(1);
  });

  it('空列表不产生 NaN', () => {
    expect(categoryDistribution([])).toEqual([]);
  });
});

describe('stockValue（在库总价值）', () => {
  it('金额 = 单价 × 数量，不是累加单价', () => {
    const items = [mkItem({ id: 'a', qty: 20, price: 1.5 })];
    expect(stockValue(items, TODAY).total).toBe(30);
  });

  it('★ 过期计入，且单独给出过期金额', () => {
    // 用户拍板的口径：还没扔就是还在，但混在总数里会让人高估可用物资
    const items = [
      mkItem({ id: 'a', qty: 2, price: 5, expireIn: -1 }),   // 已过期 10 元
      mkItem({ id: 'b', qty: 1, price: 6, expireIn: 3 }),    // 未过期 6 元
    ];
    const v = stockValue(items, TODAY);
    expect(v.total).toBe(16);
    expect(v.overAmount).toBe(10);
  });

  it('今天到期不算过期', () => {
    expect(stockValue([mkItem({ id: 'a', price: 5, expireIn: 0 })], TODAY).overAmount).toBe(0);
  });

  it('★ 没填价的不计入金额，但要如实计数', () => {
    const items = [
      mkItem({ id: 'a', price: null, qty: 3 }),
      mkItem({ id: 'b', price: 2, qty: 1 }),
    ];
    const v = stockValue(items, TODAY);
    expect(v.total).toBe(2);
    expect(v.priced).toBe(1);
    expect(v.unpriced).toBe(1);
  });

  it('单价 0（真的免费）计入 priced，不是 unpriced', () => {
    const v = stockValue([mkItem({ id: 'a', price: 0, qty: 4 })], TODAY);
    expect(v.total).toBe(0);
    expect(v.priced).toBe(1);
    expect(v.unpriced).toBe(0);
  });

  it('已用完 / 已删除的不计入', () => {
    const items = [
      mkItem({ id: 'a', price: 10, status: 'finished' }),
      mkItem({ id: 'b', price: 10, deletedAt: NOW }),
      mkItem({ id: 'c', price: 10 }),
    ];
    expect(stockValue(items, TODAY).total).toBe(10);
  });

  it('脏单价（负数 / 字符串）按没填价处理，不产生 NaN', () => {
    const items = [
      mkItem({ id: 'a', price: -5, qty: 2 }),
      mkItem({ id: 'b', price: '8' as unknown as number, qty: 2 }),
    ];
    const v = stockValue(items, TODAY);
    expect(v.total).toBe(0);
    expect(v.unpriced).toBe(2);
    expect(Number.isFinite(v.total)).toBe(true);
  });

  it('空列表 / 全没填价时是 0 而不是 NaN', () => {
    expect(stockValue([], TODAY)).toEqual({ total: 0, overAmount: 0, priced: 0, unpriced: 0 });
  });
});
