import { describe, expect, it } from 'vitest';
import { diffMonth, previousMonthKey, snapshotFromItems, isCurrentMonthLog } from '../snapshot';
import type { ConsumeLog, StockSnapshot } from '../types';
import { mkItem, NOW, ds } from './fixtures';

const DAY = 86_400_000;

describe('previousMonthKey（v1.1 F4）', () => {
  it('上个月份键，跨年正确', () => {
    expect(previousMonthKey(Date.UTC(2026, 9, 5))).toBe('2026-09'); // 10 月 → 9 月
    expect(previousMonthKey(Date.UTC(2027, 0, 3))).toBe('2026-12'); // 2027-01 → 2026-12
  });
});

describe('snapshotFromItems', () => {
  it('只定格在库物品，字段按对比所需裁剪', () => {
    const snap = snapshotFromItems('2026-09', [
      mkItem({ id: 'a', name: '牛奶', qty: 2, loc: 'L1' }),
      mkItem({ id: 'done', name: '喝完的', status: 'finished' }),
      mkItem({ id: 'del', name: '删掉的', deletedAt: NOW }),
    ], NOW);
    expect(snap.month).toBe('2026-09');
    expect(snap.items).toHaveLength(1);
    expect(snap.items[0]).toMatchObject({ id: 'a', name: '牛奶', quantity: 2 });
  });
});

describe('diffMonth', () => {
  const alias = (n: string) => (n === '番茄' || n === '西红柿' ? '番茄' : null);
  const snapOf = (rows: { name: string; qty: number; unit?: string; loc?: string; dictKey?: string | null }[]): StockSnapshot =>
    ({
      id: '2026-09',
      month: '2026-09',
      items: rows.map((r, i) => ({
        id: `s${i}`,
        name: r.name,
        dictKey: r.dictKey ?? null,
        quantity: r.qty,
        unit: r.unit ?? '个',
        price: null,
        locationId: r.loc ?? 'L1',
      })),
      createdAt: NOW,
      updatedAt: NOW,
      deletedAt: null,
    });

  const log = (s: Partial<ConsumeLog> & { at: number }): ConsumeLog => ({
    id: s.id ?? `l${s.at}`,
    itemId: s.itemId ?? 'i1',
    name: s.name ?? '测试',
    quantity: s.quantity ?? 1,
    unit: s.unit ?? '个',
    locationId: 'L1',
    type: s.type ?? 'consumed',
    price: null,
    unitPrice: null,
    expireAt: null,
    overdueDays: null,
    at: s.at,
    createdAt: s.at,
    deletedAt: s.deletedAt ?? null,
  });

  it('★ 新出现 → 新购；消失 → 减少并对账去向（用掉 / 扔掉 / 无记录）', () => {
    const prev = snapOf([{ name: '青菜', qty: 3 }, { name: '牛奶', qty: 2, unit: '盒' }]);
    const cur = [
      mkItem({ id: 'a', name: '青菜', qty: 3, loc: 'L1' }),           // 不变
      mkItem({ id: 'b', name: '鸡蛋', qty: 5, loc: 'L1' }),           // 新购
    ];
    const logs = [log({ name: '牛奶', type: 'wasted', at: NOW - DAY })];
    const d = diffMonth(prev, cur, logs);
    expect(d.added).toEqual([{ name: '鸡蛋', qty: 5, unit: '个', kind: 'in', note: '' }]);
    expect(d.removed).toEqual([{ name: '牛奶', qty: 2, unit: '盒', kind: 'out', note: '扔掉' }]);
  });

  it('★ 数量增减给差值而不是总量（上月 5 个 → 本月 2 个 = 减少 3）', () => {
    const prev = snapOf([{ name: '鸡蛋', qty: 5 }]);
    const cur = [mkItem({ id: 'a', name: '鸡蛋', qty: 2, loc: 'L1' })];
    const d = diffMonth(prev, cur, []);
    expect(d.removed[0]).toMatchObject({ qty: 3, note: '无消耗记录' });
    expect(d.added).toHaveLength(0);
  });

  it('★ 折叠键与库存同一把：别名（番茄/西红柿）、单位、位置都参与', () => {
    const prev = snapOf([{ name: '番茄', qty: 1 }]);
    const cur = [
      mkItem({ id: 'a', name: '西红柿', dictKey: '西红柿', qty: 1, loc: 'L1' }), // 别名同物 → 不报增减
      mkItem({ id: 'b', name: '牛奶', qty: 1, unit: '盒', loc: 'L1' }),
    ];
    const d = diffMonth(prev, cur, [], alias);
    expect(d.added.map((r) => r.name)).toEqual(['牛奶']); // 番茄↔西红柿 无感
    expect(d.removed).toHaveLength(0);
  });

  it('对账命中消耗 + 浪费 →「用掉+扔掉」；未命中 →「无消耗记录」', () => {
    const prev = snapOf([{ name: '青菜', qty: 2 }, { name: '土豆', qty: 1 }]);
    const cur: never[] = [];
    const logs = [
      log({ name: '青菜', type: 'consumed', at: NOW }),
      log({ name: '青菜', type: 'wasted', at: NOW - DAY }),
    ];
    const d = diffMonth(prev, cur, logs);
    const byName = Object.fromEntries(d.removed.map((r) => [r.name, r.note]));
    expect(byName['青菜']).toBe('用掉+扔掉');
    expect(byName['土豆']).toBe('无消耗记录');
  });
});

describe('isCurrentMonthLog', () => {
  it('只认本月且时间戳合法的日志', () => {
    expect(isCurrentMonthLog({ at: NOW } as ConsumeLog, NOW)).toBe(true);            // NOW 在 2026-10
    expect(isCurrentMonthLog({ at: NOW - 40 * DAY } as ConsumeLog, NOW)).toBe(false); // 9 月
    expect(isCurrentMonthLog({ at: NaN } as never, NOW)).toBe(false);
    expect(isCurrentMonthLog({ at: 'x' as never } as never, NOW)).toBe(false);
  });
});
