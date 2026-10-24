import { describe, expect, it } from 'vitest';
import { freshnessOf, sortByFreshness, groupByFreshness } from '../freshness';
import { computeExpiry } from '../shelfLife';
import { NOT_RECOMMENDED } from '../types';
import { mkItem, SETTINGS, TODAY, ds } from './fixtures';

const stateOf = (expireIn: number | null, extra: Partial<Parameters<typeof mkItem>[0]> = {}) =>
  freshnessOf(mkItem({ expireIn, ...extra }), TODAY, SETTINGS).state;

describe('freshnessOf 的状态边界', () => {
  it('d < 0 → over', () => expect(stateOf(-1)).toBe('over'));
  it('d = 0 → urgent', () => expect(stateOf(0)).toBe('urgent'));
  it('d = urgentDays → urgent', () => expect(stateOf(3)).toBe('urgent'));
  it('d = urgentDays + 1 → soon', () => expect(stateOf(4)).toBe('soon'));
  it('d = soonDays → soon', () => expect(stateOf(14)).toBe('soon'));
  it('d > soonDays → fresh', () => expect(stateOf(15)).toBe('fresh'));

  it('无到期日 → none；不宜存放且无到期日 → warn', () => {
    expect(stateOf(null)).toBe('none');
    expect(stateOf(null, { notRecommended: true })).toBe('warn');
  });

  it('阈值跟随设置，而不是写死 3 / 14', () => {
    const loose = { urgentDays: 7, soonDays: 30 };
    expect(freshnessOf(mkItem({ expireIn: 5 }), TODAY, loose).state).toBe('urgent');
    expect(freshnessOf(mkItem({ expireIn: 5 }), TODAY, SETTINGS).state).toBe('soon');
  });
});

describe('sortByFreshness', () => {
  it('按剩余天数升序，同天数按名称', () => {
    const sorted = sortByFreshness([
      { sortKey: 5, name: '香蕉' },
      { sortKey: 1, name: '牛奶' },
      { sortKey: 1, name: '鸡蛋' },
    ]);
    expect(sorted.map((x) => x.name)).toEqual(['鸡蛋', '牛奶', '香蕉']);
  });
});

describe('groupByFreshness', () => {
  it('按 紧急 / 临期 / 新鲜 / 未设 分组，空组不出现', () => {
    const rows = [
      { state: 'over' as const, name: 'a' },
      { state: 'fresh' as const, name: 'b' },
      { state: 'none' as const, name: 'c' },
    ];
    expect(groupByFreshness(rows).map((g) => g.group)).toEqual(['urgent', 'fresh', 'none']);
  });
});

describe('computeExpiry', () => {
  const input = { name: '菠菜', category: 'vegetable' as const, storedAt: TODAY, producedAt: null, manualShelfLife: null };
  const resolve = () => ({ days: 5 as const, source: 'builtin' as const, reason: null });
  const fallback = () => 7;

  it('env = none → 不计保质期', () => {
    expect(computeExpiry(input, 'none', resolve, fallback)).toMatchObject({ expireAt: null, days: null, source: 'none' });
  });

  it('手填保质期优先，且 source 标 manual', () => {
    const r = computeExpiry({ ...input, manualShelfLife: 30 }, 'chilled', resolve, fallback);
    expect(r.expireAt).toBe(ds(30));
    expect(r.source).toBe('manual');
  });

  it('有生产日期时以生产日期为基准', () => {
    const r = computeExpiry({ ...input, producedAt: ds(-2) }, 'chilled', resolve, fallback);
    expect(r.expireAt).toBe(ds(3));
  });

  it('字典判不宜存放 → notRecommended 且不给到期日', () => {
    const r = computeExpiry(input, 'frozen', () => ({ days: NOT_RECOMMENDED, source: 'builtin', reason: '会冻坏' }), fallback);
    expect(r.notRecommended).toBe(true);
    expect(r.expireAt).toBeNull();
    expect(r.reason).toBe('会冻坏');
  });

  it('字典没命中（days 为 null）→ 无到期日，不算不宜存放', () => {
    const r = computeExpiry(input, 'chilled', () => ({ days: null, source: 'none', reason: null }), fallback);
    expect(r.expireAt).toBeNull();
    expect(r.notRecommended).toBe(false);
  });
});

/* ==================== 脏数据防御 ==================== */

describe('脏数据不炸（导入前就存在的坏记录）', () => {
  it('expireAt 是数字 0 / 空串 / 非日期字符串 → 当作「未设保质期」，不抛错', () => {
    for (const bad of [0, '', 'abc', '2026/10/08', null, undefined]) {
      const f = freshnessOf({ ...mkItem({ expireIn: 5 }), expireAt: bad } as never, TODAY, SETTINGS);
      expect(f.state).toBe('none');
      expect(f.remainDays).toBeNull();
    }
  });

  it('expireAt 脏 + notRecommended → warn（而不是 none）', () => {
    const f = freshnessOf(
      { ...mkItem({ expireIn: null }), expireAt: 'abc', notRecommended: true } as never,
      TODAY,
      SETTINGS,
    );
    expect(f.state).toBe('warn');
  });

  it('合法日期不受影响', () => {
    expect(freshnessOf(mkItem({ expireIn: 2 }), TODAY, SETTINGS).state).toBe('urgent');
  });
});
