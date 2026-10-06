import { describe, expect, it } from 'vitest';
import { inboundDefaults, inboundInputs } from '../inbound';
import { mkItem, mkLocation, mkShopping } from './fixtures';
import { NOW } from './fixtures';

const locs = [mkLocation('L1', '冰箱冷藏', 'chilled', 10), mkLocation('L3', '蔬果篮', 'ventilated', 20)];

/** 别名解析器桩：把「西红柿 / 番茄 / 圣女果」归到同一个 key */
const aliasKey = (name: string) => (['西红柿', '番茄', '圣女果'].includes(name) ? 'tomato' : null);

describe('inboundDefaults 的三级优先级', () => {
  it('清单项自带值 > 上次同名称历史 > 默认', () => {
    const hist = [mkItem({ id: 'h', name: '牛奶', qty: 4, unit: '盒', loc: 'L3', createdAt: NOW })];

    // ① 清单项自带：赢（price 只从历史带，清单项本身没有价格字段）
    expect(inboundDefaults(mkShopping({ name: '牛奶', qty: 2, unit: '瓶', loc: 'L1' }), hist, locs)).toEqual({
      quantity: 2,
      unit: '瓶',
      locationId: 'L1',
      price: null,
    });

    // ② 没有自带值：继承历史
    expect(inboundDefaults(mkShopping({ name: '牛奶' }), hist, locs)).toEqual({
      quantity: 4,
      unit: '盒',
      locationId: 'L3',
      price: null,
    });

    // ③ 没有历史：走默认
    expect(inboundDefaults(mkShopping({ name: '没买过的东西' }), [], locs)).toEqual({
      quantity: 1,
      unit: '个',
      locationId: 'L1',
      price: null,
    });
  });

  it('所有位置停用时 locationId 为 null（调用方据此禁用入库）', () => {
    const off = [mkLocation('L1', '冰箱冷藏', 'chilled', 10, false)];
    expect(inboundDefaults(mkShopping({ name: '随便' }), [], off).locationId).toBeNull();
  });
});

describe('别名匹配', () => {
  it('传 aliasKey 时「西红柿」命中历史里的「番茄」', () => {
    const hist = [mkItem({ id: 'h', name: '番茄', qty: 2, unit: '袋', loc: 'L3' })];
    const got = inboundDefaults(mkShopping({ name: '西红柿' }), hist, locs, aliasKey);
    expect(got.locationId).toBe('L3');
    expect(got.quantity).toBe(2);
    expect(got.unit).toBe('袋');
  });

  it('★ 不传 aliasKey 时匹配不上 —— 锁住这条回归', () => {
    // normalizeName 只有形式归一、没有同义词表，别名必须靠调用方注入
    const hist = [mkItem({ id: 'h', name: '番茄', loc: 'L3' })];
    expect(inboundDefaults(mkShopping({ name: '西红柿' }), hist, locs).locationId).toBe('L1');
  });

  it('历史物品自带的 dictKey 优先于实时解析', () => {
    const hist = [mkItem({ id: 'h', name: '随便一个名字', dictKey: 'tomato', loc: 'L3' })];
    expect(inboundDefaults(mkShopping({ name: '西红柿' }), hist, locs, aliasKey).locationId).toBe('L3');
  });
});

describe('单价推断', () => {
  it('★ 带出上次同名称的单价（这才是「入库能填价」的关键）', () => {
    const hist = [mkItem({ id: 'h', name: '牛奶', price: 3.5, createdAt: NOW })];
    expect(inboundDefaults(mkShopping({ name: '牛奶' }), hist, locs).price).toBe(3.5);
  });

  it('历史没填价 → null，不能落成 0（0 会被统计当成「真的免费」）', () => {
    const hist = [mkItem({ id: 'h', name: '牛奶', price: null })];
    expect(inboundDefaults(mkShopping({ name: '牛奶' }), hist, locs).price).toBeNull();
  });

  it('★ 历史是旧备份导入的脏值（负数 / 字符串）→ null', () => {
    const hist = [mkItem({ id: 'h', name: '牛奶', price: -5 })];
    expect(inboundDefaults(mkShopping({ name: '牛奶' }), hist, locs).price).toBeNull();
  });

  it('别名命中也要带出价格（「西红柿」→「番茄」）', () => {
    const hist = [mkItem({ id: 'h', name: '番茄', price: 6.8 })];
    expect(inboundDefaults(mkShopping({ name: '西红柿' }), hist, locs, aliasKey).price).toBe(6.8);
  });
});

describe('inboundInputs', () => {
  it('逐项生成入库计划，并传下去别名解析器', () => {
    const hist = [mkItem({ id: 'h', name: '番茄', loc: 'L3' })];
    const { rows, skipped } = inboundInputs(
      [mkShopping({ id: 's1', name: '西红柿' }), mkShopping({ id: 's2', name: '没买过的' })],
      hist,
      locs,
      { aliasKey },
    );
    expect(rows.map((r) => [r.shoppingId, r.input.name, r.input.locationId])).toEqual([
      ['s1', '西红柿', 'L3'],
      ['s2', '没买过的', 'L1'],
    ]);
    expect(skipped).toHaveLength(0);
  });

  it('名称为空 / 无可用位置的项进 skipped，由调用方如实告知用户', () => {
    const { rows, skipped } = inboundInputs(
      [mkShopping({ id: 's1', name: '   ' }), mkShopping({ id: 's2', name: '有名字' })],
      [],
      [mkLocation('L1', '冷藏', 'chilled', 10, false)],
    );
    expect(rows).toHaveLength(0);
    expect(skipped.map((s) => s.id)).toEqual(['s1', 's2']);
  });

  it('overrides 优先于推断值（「全部入库」走这条）', () => {
    const hist = [mkItem({ id: 'h', name: '牛奶', qty: 4, loc: 'L3' })];
    const { rows } = inboundInputs([mkShopping({ id: 's1', name: '牛奶' })], hist, locs, {
      overrides: new Map([['s1', { quantity: 9, locationId: 'L1' }]]),
    });
    expect(rows[0].input.quantity).toBe(9);
    expect(rows[0].input.locationId).toBe('L1');
  });

  it('★ 用户改过的价进 input；overrides 没给 price 时用推断价', () => {
    const hist = [mkItem({ id: 'h', name: '牛奶', price: 3.5 })];
    const withOverride = inboundInputs([mkShopping({ id: 's1', name: '牛奶' })], hist, locs, {
      overrides: new Map([['s1', { quantity: 1, locationId: 'L1', price: 4.2 }]]),
    });
    expect(withOverride.rows[0].input.price).toBe(4.2);

    const noOverride = inboundInputs([mkShopping({ id: 's1', name: '牛奶' })], hist, locs, {
      overrides: new Map([['s1', { quantity: 1, locationId: 'L1' }]]),
    });
    expect(noOverride.rows[0].input.price).toBe(3.5);
  });

  it('★ 用户明确清空了单价（price: null）要尊重，不能被推断价填回去', () => {
    const hist = [mkItem({ id: 'h', name: '牛奶', price: 3.5 })];
    const { rows } = inboundInputs([mkShopping({ id: 's1', name: '牛奶' })], hist, locs, {
      overrides: new Map([['s1', { quantity: 1, locationId: 'L1', price: null }]]),
    });
    expect(rows[0].input.price).toBeNull();
  });
});
