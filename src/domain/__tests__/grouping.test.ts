import { describe, expect, it } from 'vitest';
import {
  expiryCompatible,
  fefoCompare,
  fefoSlices,
  findMergeTarget,
  foldItems,
  foldKeyOf,
  planGroupConsume,
  sortFefo,
} from '../grouping';
import { mkItem, NOW, TODAY, ds } from './fixtures';

/** 简易别名解析器：把「番茄」与「西红柿」都映射到 '西红柿' */
const alias = (name: string) => (name === '番茄' || name === '西红柿' ? '西红柿' : null);

describe('foldKeyOf', () => {
  it('同位置同名字同单位 → 同键', () => {
    expect(foldKeyOf(mkItem({ name: '牛奶', loc: 'L1' }))).toBe(foldKeyOf(mkItem({ name: '牛奶', loc: 'L1' })));
  });

  it('不同位置 → 不同键（冰箱里的和阳台上的不能并成一张卡）', () => {
    expect(foldKeyOf(mkItem({ name: '牛奶', loc: 'L1' }))).not.toBe(foldKeyOf(mkItem({ name: '牛奶', loc: 'L2' })));
  });

  it('字典别名相同 → 同键（「番茄」折叠进「西红柿」）', () => {
    expect(foldKeyOf(mkItem({ name: '番茄' }), alias)).toBe(foldKeyOf(mkItem({ name: '西红柿' }), alias));
  });

  it('★ 旧数据的 dictKey 是原始名：也必须过别名解析后折叠（REV-14 的核心场景）', () => {
    // v3 之前 createItem 写 dictKey = 原始输入名，两条记录各存各的「西红柿」/「番茄」。
    // 若直接拿 dictKey 当键比对，别名折叠对全部存量数据形同虚设。
    const a = mkItem({ id: 'a', name: '西红柿', dictKey: '西红柿' });
    const b = mkItem({ id: 'b', name: '番茄', dictKey: '番茄' });
    expect(foldKeyOf(a, alias)).toBe(foldKeyOf(b, alias));
  });

  it('dictKey 未命中字典时回落 normalizeName（自定义食材没有词根）', () => {
    const a = mkItem({ name: '自制酸奶', dictKey: '自制酸奶' });
    const b = mkItem({ name: '自制酸奶', dictKey: null });
    expect(foldKeyOf(a, alias)).toBe(foldKeyOf(b, alias));
  });

  it('★ 同位置同名但单位不同 → 不同键（「2 盒 + 1 袋」不能折成「3 盒」，REV-44）', () => {
    expect(foldKeyOf(mkItem({ name: '牛奶', loc: 'L1', unit: '盒' })))
      .not.toBe(foldKeyOf(mkItem({ name: '牛奶', loc: 'L1', unit: '袋' })));
  });
});

describe('fefoCompare / sortFefo', () => {
  it('到期日升序，无到期日的排最后', () => {
    const list = [
      mkItem({ id: 'a', name: '晚期', expireIn: 20 }),
      mkItem({ id: 'b', name: '无期', expireIn: null }),
      mkItem({ id: 'c', name: '早期', expireIn: 2 }),
    ];
    expect(sortFefo(list).map((i) => i.name)).toEqual(['早期', '晚期', '无期']);
  });

  it('同一天则按入库时刻升序（先进先出）', () => {
    const early = mkItem({ id: 'a', expireIn: 3, createdAt: NOW - 2000 });
    const late = mkItem({ id: 'b', expireIn: 3, createdAt: NOW - 1000 });
    expect(sortFefo([late, early]).map((i) => i.id)).toEqual(['a', 'b']);
    expect(fefoCompare(early, late)).toBeLessThan(0);
  });
});

describe('foldItems', () => {
  const milkA = () => mkItem({ id: 'a', name: '牛奶', loc: 'L1', expireIn: 3, qty: 1, unit: '盒' });
  const milkB = () => mkItem({ id: 'b', name: '牛奶', loc: 'L1', expireIn: 10, qty: 2, unit: '盒' });

  it('同名同位置 → 折成一组，lead 是最早到期那份', () => {
    const g = foldItems([milkB(), milkA()]);
    expect(g).toHaveLength(1);
    expect(g[0]!.lead.id).toBe('a');
    expect(g[0]!.totalQuantity).toBe(3);
    expect(g[0]!.members.map((m) => m.id)).toEqual(['a', 'b']);
  });

  it('不同位置 → 两组', () => {
    const g = foldItems([milkA(), mkItem({ id: 'c', name: '牛奶', loc: 'L2', expireIn: 3 })]);
    expect(g).toHaveLength(2);
  });

  it('★ 同位置同名但单位不同 → 两组，数量不跨单位相加（REV-44）', () => {
    const g = foldItems([
      mkItem({ id: 'a', name: '牛奶', loc: 'L1', expireIn: 3, qty: 2, unit: '盒' }),
      mkItem({ id: 'b', name: '牛奶', loc: 'L1', expireIn: 5, qty: 1, unit: '袋' }),
    ]);
    expect(g).toHaveLength(2);
    expect(g.every((x) => x.totalQuantity !== 3)).toBe(true);
  });

  it('已用完 / 已删除的不参与分组', () => {
    const g = foldItems([
      milkA(),
      mkItem({ id: 'b', name: '牛奶', loc: 'L1', status: 'finished' }),
      mkItem({ id: 'c', name: '牛奶', loc: 'L1', deletedAt: NOW }),
    ]);
    expect(g).toHaveLength(1);
    expect(g[0]!.members).toHaveLength(1);
  });

  it('组间按 lead 到期日升序，无到期日的组排最后', () => {
    const g = foldItems([
      mkItem({ id: 'x', name: '面包', loc: 'L1', expireIn: null }),
      mkItem({ id: 'y', name: '鸡蛋', loc: 'L1', expireIn: 1 }),
      mkItem({ id: 'z', name: '青菜', loc: 'L1', expireIn: 9 }),
    ]);
    expect(g.map((i) => i.name)).toEqual(['鸡蛋', '青菜', '面包']);
  });

  it('别名相同的一起折叠，且展示名取 lead 的名字', () => {
    const g = foldItems(
      [mkItem({ id: 'a', name: '西红柿', expireIn: 1 }), mkItem({ id: 'b', name: '番茄', expireIn: 9 })],
      alias,
    );
    expect(g).toHaveLength(1);
    expect(g[0]!.name).toBe('西红柿');
  });
});

describe('fefoSlices', () => {
  const a = () => mkItem({ id: 'a', name: '牛奶', expireIn: 1, qty: 1 });
  const b = () => mkItem({ id: 'b', name: '牛奶', expireIn: 8, qty: 2 });

  it('单份够用时只动最早那份', () => {
    const s = fefoSlices([b(), a()], 1);
    expect(s).toHaveLength(1);
    expect(s[0]!.item.id).toBe('a');
    expect(s[0]!.take).toBe(1);
  });

  it('不够时跨份顺延', () => {
    const s = fefoSlices([a(), b()], 2);
    expect(s.map((x) => [x.item.id, x.take])).toEqual([
      ['a', 1],
      ['b', 1],
    ]);
  });

  it('数量超过总量时只分配到有的为止（不超发）', () => {
    const s = fefoSlices([a(), b()], 99);
    expect(s.reduce((sum, x) => sum + x.take, 0)).toBe(3);
  });
});

describe('planGroupConsume', () => {
  it('取完一份 → finished 且 quantity 保留原值（供日志对账与撤销回加）', () => {
    const a = mkItem({ id: 'a', name: '牛奶', expireIn: 1, qty: 1, price: 3 });
    const b = mkItem({ id: 'b', name: '牛奶', expireIn: 8, qty: 2, price: 3 });
    const plan = planGroupConsume([a, b], 2, 'consumed', NOW);
    const first = plan.items.find((i) => i.id === 'a')!;
    const second = plan.items.find((i) => i.id === 'b')!;
    expect(first.status).toBe('finished');
    expect(first.quantity).toBe(1); // 没被扣成 0
    expect(second.status).toBe('in_stock');
    expect(second.quantity).toBe(1);
    expect(plan.logs).toHaveLength(2);
  });

  it('日志的 price 记「本次金额」而非整份的钱', () => {
    const a = mkItem({ id: 'a', name: '牛奶', expireIn: 1, qty: 5, price: 2.5 });
    const plan = planGroupConsume([a], 2, 'wasted', NOW);
    expect(plan.logs[0]!.price).toBe(5);
    expect(plan.logs[0]!.unitPrice).toBe(2.5);
  });

  it('无价格时 price 为 null（不是 0，避免统计把「没填价」当成「免费」）', () => {
    const a = mkItem({ id: 'a', name: '牛奶', expireIn: 1, qty: 5, price: null });
    expect(planGroupConsume([a], 2, 'wasted', NOW).logs[0]!.price).toBeNull();
  });
});

describe('expiryCompatible / findMergeTarget', () => {
  it('都无到期日 → 可合并', () => {
    expect(expiryCompatible(null, null)).toBe(true);
  });
  it('一个有、一个没有 → 不可合并', () => {
    expect(expiryCompatible(ds(3), null)).toBe(false);
  });
  it('相差 ≤ 1 天 → 可合并；相差 3 天 → 不可', () => {
    expect(expiryCompatible(ds(0), ds(1))).toBe(true);
    expect(expiryCompatible(ds(0), ds(3))).toBe(false);
  });

  it('★ 脏日期（0 / "abc"）不抛错，按「无到期日」参与判定（REV-45）', () => {
    expect(expiryCompatible(0 as never, null)).toBe(true);
    expect(expiryCompatible('abc' as never, 'abc' as never)).toBe(true);
    expect(expiryCompatible(ds(3), 'abc' as never)).toBe(false);
  });

  it('找到同名同位置且到期日相同的既有记录', () => {
    const created = mkItem({ id: 'new', name: '牛奶', loc: 'L1', expireIn: 5 });
    const old = mkItem({ id: 'old', name: '牛奶', loc: 'L1', expireIn: 5 });
    expect(findMergeTarget(created, [old])?.id).toBe('old');
  });

  it('到期日差 3 天 → 不合并（分属不同批次，合并会丢信息）', () => {
    const created = mkItem({ id: 'new', name: '牛奶', loc: 'L1', expireIn: 5 });
    const old = mkItem({ id: 'old', name: '牛奶', loc: 'L1', expireIn: 8 });
    expect(findMergeTarget(created, [old])).toBeUndefined();
  });

  it('已用完的旧记录不作为合并目标', () => {
    const created = mkItem({ id: 'new', name: '牛奶', expireIn: 5 });
    const old = mkItem({ id: 'old', name: '牛奶', expireIn: 5, status: 'finished' });
    expect(findMergeTarget(created, [old])).toBeUndefined();
  });

  it('★ 单位不同 → 不合并（数量相加跨单位无意义，REV-44）', () => {
    const created = mkItem({ id: 'new', name: '牛奶', unit: '袋', expireIn: 5 });
    const old = mkItem({ id: 'old', name: '牛奶', unit: '盒', expireIn: 5 });
    expect(findMergeTarget(created, [old])).toBeUndefined();
  });
});

describe('TODAY 基准', () => {
  it('夹具的 TODAY 就是 ds(0)（防止时间基准被无意改动）', () => {
    expect(TODAY).toBe(ds(0));
  });
});
