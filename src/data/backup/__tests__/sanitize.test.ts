import { describe, expect, it } from 'vitest';
import {
  isDateStr,
  sanitizeDict,
  sanitizeItems,
  sanitizeLocations,
  sanitizeLogs,
  sanitizeShopping,
} from '../sanitize';

const TODAY = '2026-10-05';
const NOW = 1759622400000;

/** 一个字段齐全的合法物品，只改需要测的字段 */
const good = (o: Record<string, unknown> = {}) => ({
  id: 'i1', name: '牛奶', dictKey: null, category: 'eggMilk', icon: '牛',
  quantity: 2, unit: '盒', price: 3, locationId: 'L1',
  storedAt: '2026-10-01', producedAt: null, expireAt: '2026-10-08',
  shelfLifeDays: 7, shelfLifeSource: 'builtin', manualShelfLife: null,
  notRecommended: false, notRecommendedReason: null,
  status: 'in_stock', note: null, snoozeUntil: null,
  createdAt: 1, updatedAt: 1, deletedAt: null,
  ...o,
});

describe('isDateStr', () => {
  it('只认 YYYY-MM-DD', () => {
    expect(isDateStr('2026-10-05')).toBe(true);
    expect(isDateStr('2026-1-5')).toBe(false);
    expect(isDateStr(20261005)).toBe(false);
    expect(isDateStr(0)).toBe(false);
    expect(isDateStr(null)).toBe(false);
    expect(isDateStr('昨天')).toBe(false);
  });
});

describe('sanitizeItems', () => {
  it('合法记录原样通过，不算作修正', () => {
    const r = sanitizeItems([good()], TODAY);
    expect(r.dropped).toBe(0);
    expect(r.fixed).toBe(0);
    expect(r.rows[0]).toMatchObject({ id: 'i1', name: '牛奶', storedAt: '2026-10-01', expireAt: '2026-10-08' });
  });

  it('★ storedAt 是数字时替换为当天 —— 这条曾让「我的」「库存」双页白屏', () => {
    // monthStats → monthKey(0) → (0).slice is not a function
    // freshnessOf → parseDate(0) → (0).split is not a function
    const r = sanitizeItems([good({ storedAt: 0 })], TODAY);
    expect(r.rows[0]!.storedAt).toBe(TODAY);
    expect(r.fixed).toBe(1);
    expect(() => (r.rows[0]!.storedAt as string).slice(0, 7)).not.toThrow();
  });

  it('storedAt 缺失同样兜底', () => {
    const o = good();
    delete (o as Record<string, unknown>).storedAt;
    const r = sanitizeItems([o], TODAY);
    expect(r.rows[0]!.storedAt).toBe(TODAY);
  });

  it('expireAt / producedAt 非法 → 置 null（而不是留着让日期计算炸掉）', () => {
    const r = sanitizeItems([good({ expireAt: 0, producedAt: 'x' })], TODAY);
    expect(r.rows[0]!.expireAt).toBeNull();
    expect(r.rows[0]!.producedAt).toBeNull();
    expect(r.fixed).toBeGreaterThanOrEqual(2);
  });

  it('null 的 expireAt / producedAt 是合法值，不该被算作修正', () => {
    const r = sanitizeItems([good({ expireAt: null, producedAt: null })], TODAY);
    expect(r.rows[0]!.expireAt).toBeNull();
    expect(r.fixed).toBe(0);
  });

  it('缺 id 或 name 的记录被丢弃并计数', () => {
    const r = sanitizeItems([good(), good({ id: '' }), good({ name: '  ' }), null, 'x'], TODAY);
    expect(r.rows).toHaveLength(1);
    expect(r.dropped).toBe(4);
  });

  it('quantity 非正数 / 非数字 → 归 1', () => {
    const r = sanitizeItems([good({ quantity: 0 }), good({ id: 'i2', quantity: -3 }), good({ id: 'i3', quantity: 'x' })], TODAY);
    expect(r.rows.map((i) => i.quantity)).toEqual([1, 1, 1]);
  });

  it('status 非法值归 in_stock（finished 保留）', () => {
    const r = sanitizeItems([good({ id: 'a', status: 'weird' }), good({ id: 'b', status: 'finished' })], TODAY);
    expect(r.rows[0]!.status).toBe('in_stock');
    expect(r.rows[1]!.status).toBe('finished');
  });

  it('unit / locationId 脏值兜底，避免渲染时炸掉', () => {
    const r = sanitizeItems([good({ unit: 123, locationId: null })], TODAY);
    expect(r.rows[0]!.unit).toBe('个');
    expect(r.rows[0]!.locationId).toBe('');
  });

  it('多条里只有一条坏：好的那条必须保住', () => {
    const r = sanitizeItems([good({ id: 'ok' }), good({ id: 'bad', storedAt: 0 })], TODAY);
    expect(r.rows.map((i) => i.id)).toEqual(['ok', 'bad']);
  });

  describe('物品单价（★ 早期漏洗的那一处）', () => {
    it('★ 字符串价格 "12.5" → null，不能原样穿透', () => {
      // 穿透后 price * 数量 = NaN，整月「浪费金额」跟着烂掉
      const r = sanitizeItems([good({ price: '12.5' })], TODAY);
      expect(r.rows[0]!.price).toBeNull();
      expect(r.fixed).toBe(1);
    });

    it('★ 负数 / Infinity 单价 → null（负数会把月度统计拉成负数）', () => {
      expect(sanitizeItems([good({ price: -5 })], TODAY).rows[0]!.price).toBeNull();
      expect(sanitizeItems([good({ price: Infinity })], TODAY).rows[0]!.price).toBeNull();
      expect(sanitizeItems([good({ price: NaN })], TODAY).rows[0]!.price).toBeNull();
    });

    it('★ price: 0 是合法的（真的免费），必须保住而不是被洗成 null', () => {
      const r = sanitizeItems([good({ price: 0 })], TODAY);
      expect(r.rows[0]!.price).toBe(0);
      expect(r.fixed).toBe(0);
    });

    it('price 缺失 / 显式 null 都算「本来就没填」，不计入 fixed', () => {
      expect(sanitizeItems([good({ price: null })], TODAY).fixed).toBe(0);
      const o = good();
      delete (o as Record<string, unknown>).price;
      const r = sanitizeItems([o], TODAY);
      expect(r.rows[0]!.price).toBeNull();
      expect(r.fixed).toBe(0);
    });

    it('note 非字符串 → null（列表页当字符串用会炸）', () => {
      expect(sanitizeItems([good({ note: 42 })], TODAY).rows[0]!.note).toBeNull();
    });
  });
});

describe('sanitizeLogs', () => {
  const log = (o: Record<string, unknown> = {}) => ({
    id: 'l1', itemId: 'i1', name: '牛奶', quantity: 1, unit: '盒', locationId: 'L1',
    type: 'consumed', price: 3, unitPrice: 3, note: null,
    expireAt: '2026-10-08', overdueDays: 0, at: 1000, createdAt: 1000, deletedAt: null,
    ...o,
  });

  it('合法记录原样通过', () => {
    const r = sanitizeLogs([log()]);
    expect(r.fixed).toBe(0);
    expect(r.dropped).toBe(0);
  });

  it('at 缺失 / 非法 → 用当前时间（否则排序与月度统计全错）', () => {
    const r = sanitizeLogs([log({ at: null }), log({ id: 'l2', at: 'x' })]);
    expect(r.rows.every((l) => Number.isFinite(l.at) && l.at > 0)).toBe(true);
  });

  it('type 非法 → consumed；wasted 保留', () => {
    const r = sanitizeLogs([log({ id: 'a', type: 'nope' }), log({ id: 'b', type: 'wasted' })]);
    expect(r.rows[0]!.type).toBe('consumed');
    expect(r.rows[1]!.type).toBe('wasted');
  });

  it('expireAt 非法 → null', () => {
    expect(sanitizeLogs([log({ expireAt: 0 })]).rows[0]!.expireAt).toBeNull();
  });

  it('price 非数字 → null（不能变成 0，否则统计把「没填价」当「免费」）', () => {
    expect(sanitizeLogs([log({ price: 'x' })]).rows[0]!.price).toBeNull();
  });

  it('★ unitPrice 非数字 → null（明细页 money() 会走到 .toFixed 抛错白屏）', () => {
    const r = sanitizeLogs([log({ unitPrice: '3' })]);
    expect(r.rows[0]!.unitPrice).toBeNull();
    expect(() => r.rows[0]!.unitPrice!.toFixed(2)).toThrow();
    expect(() => (null as number | null)?.toFixed(2)).not.toThrow();
  });

  it('★ price / unitPrice 为 0 时保住（真的免费 ≠ 没填价）', () => {
    const r = sanitizeLogs([log({ price: 0, unitPrice: 0 })]);
    expect(r.rows[0]!.price).toBe(0);
    expect(r.rows[0]!.unitPrice).toBe(0);
    expect(r.fixed).toBe(0);
  });

  it('负数价格被洗掉并计入 fixed', () => {
    const r = sanitizeLogs([log({ price: -1, unitPrice: -2 })]);
    expect(r.rows[0]!.price).toBeNull();
    expect(r.rows[0]!.unitPrice).toBeNull();
    expect(r.fixed).toBe(2);
  });

  it('note 非字符串 → null', () => {
    expect(sanitizeLogs([log({ note: 7 })]).rows[0]!.note).toBeNull();
  });
});

describe('sanitizeLocations', () => {  const loc = (o: Record<string, unknown> = {}) => ({
    id: 'L1', name: '冷藏', icon: '冷', env: 'chilled', sort: 10,
    enabled: true, builtin: true, createdAt: 1, updatedAt: 1, deletedAt: null,
    ...o,
  });

  it('env 非法 → cool（否则配色查不到值会渲染成透明）', () => {
    const r = sanitizeLocations([loc({ env: 'liquid-nitrogen' })]);
    expect(r.rows[0]!.env).toBe('cool');
    expect(r.fixed).toBe(1);
  });

  it('sort 非数字 → 999（排到末尾，不与其它位置抢顺序）', () => {
    expect(sanitizeLocations([loc({ sort: 'x' })]).rows[0]!.sort).toBe(999);
  });

  it('缺 id 丢弃', () => {
    expect(sanitizeLocations([loc(), loc({ id: '' })]).dropped).toBe(1);
  });
});

describe('sanitizeShopping', () => {
  const s = (o: Record<string, unknown> = {}) => ({
    id: 's1', name: '抽纸', quantity: 2, unit: '提', locationId: 'L1',
    reason: 'manual', sourceItemId: null, checked: false, checkedAt: null,
    auto: false, dismissedUntil: null, inboundItemId: null,
    createdAt: 1, updatedAt: 1, deletedAt: null,
    ...o,
  });

  it('reason 非法 → manual', () => {
    expect(sanitizeShopping([s({ reason: 'whatever' })]).rows[0]!.reason).toBe('manual');
  });

  it('locationId 空串 → null（否则「按位置分组」会造出一个空位置桶）', () => {
    expect(sanitizeShopping([s({ locationId: '' })]).rows[0]!.locationId).toBeNull();
  });

  it('缺 name 丢弃', () => {
    expect(sanitizeShopping([s(), s({ id: 's2', name: '' })]).dropped).toBe(1);
  });
});

describe('软删除标记清洗（跨实体）', () => {
  it('★ deletedAt 是字符串 "0" → null 并计入修正（否则该记录真值恒真、永久隐身）', () => {
    const r = sanitizeItems([good({ deletedAt: '0' })], TODAY, NOW);
    expect(r.rows[0]!.deletedAt).toBeNull();
    expect(r.fixed).toBeGreaterThan(0);
    expect(r.dropped).toBe(0);
  });

  it('deletedAt 是负数 / NaN → null；合法时间戳原样保留', () => {
    expect(sanitizeItems([good({ deletedAt: -1 })], TODAY, NOW).rows[0]!.deletedAt).toBeNull();
    expect(sanitizeItems([good({ deletedAt: 123 })], TODAY, NOW).rows[0]!.deletedAt).toBe(123);
    expect(sanitizeItems([good({ deletedAt: undefined })], TODAY, NOW).rows[0]!.deletedAt).toBeNull();
  });

  it('createdAt 非数字 → 补 now；updatedAt 缺省跟 createdAt（合并导入靠它对顺序）', () => {
    const r = sanitizeItems([good({ createdAt: '昨天', updatedAt: undefined })], TODAY, NOW);
    expect(r.rows[0]!.createdAt).toBe(NOW);
    expect(r.rows[0]!.updatedAt).toBe(NOW);
    expect(r.fixed).toBeGreaterThan(0);
  });

  it('日志的 createdAt 非法 → 跟 at', () => {
    const log = (o: Record<string, unknown> = {}) => ({
      id: 'l1', itemId: 'i1', name: '牛奶', at: 111, quantity: 1,
      type: 'consumed', expireAt: null, unit: '盒', locationId: 'L1',
      price: null, unitPrice: null, note: null, createdAt: 1, deletedAt: null,
      ...o,
    });
    const r = sanitizeLogs([log({ createdAt: 'x' })]);
    expect(r.rows[0]!.createdAt).toBe(111);
    expect(r.rows[0]!.deletedAt).toBeNull();
  });
});

describe('sanitizeDict', () => {
  const d = (o: Record<string, unknown> = {}) => ({
    id: 'd1', dictKey: '牛奶', displayName: '牛奶', env: 'chilled', days: 7,
    reason: null, origin: 'custom', createdAt: 1, updatedAt: 1, deletedAt: null,
    ...o,
  });

  it('合法记录通过', () => {
    const r = sanitizeDict([d()], NOW);
    expect(r.dropped).toBe(0);
    expect(r.fixed).toBe(0);
    expect(r.rows[0]).toMatchObject({ dictKey: '牛奶', days: 7, env: 'chilled' });
  });

  it('★ dictKey 是数字 → 丢弃（不清洗会让 stores/dict 的白屏）', () => {
    // buildCustomMap → normalizeName(e.dictKey) → (123).trim is not a function
    const r = sanitizeDict([d({ dictKey: 123 })], NOW);
    expect(r.rows).toHaveLength(0);
    expect(r.dropped).toBe(1);
  });

  it('dictKey / id 空 → 丢弃', () => {
    expect(sanitizeDict([d({ dictKey: '  ' }), d({ id: '' })], NOW).dropped).toBe(2);
  });

  it('★ days 非法（0 / 字符串 / NaN / 小于 -1）→ 整条丢弃，不猜一个天数', () => {
    const bad = [0, '7', NaN, -2];
    const r = sanitizeDict(bad.map((days, i) => d({ id: `d${i}`, days })), NOW);
    expect(r.rows).toHaveLength(0);
    expect(r.dropped).toBe(bad.length);
  });

  it('days = -1（不建议存放）是合法值', () => {
    expect(sanitizeDict([d({ days: -1 })], NOW).rows[0]!.days).toBe(-1);
  });

  it('dictKey 归一化（全角/空格/大小写）并计一次修正', () => {
    const r = sanitizeDict([d({ dictKey: ' 牛 奶 ' })], NOW);
    expect(r.rows[0]!.dictKey).toBe('牛奶');
    expect(r.fixed).toBe(1);
  });

  it('env 非法 → cool 并计修正', () => {
    const r = sanitizeDict([d({ env: 'liquid-nitrogen' })], NOW);
    expect(r.rows[0]!.env).toBe('cool');
    expect(r.fixed).toBe(1);
  });

  it('同 dictKey|env 重复 → 保留最后一条并计数', () => {
    const r = sanitizeDict([d({ id: 'old', days: 3 }), d({ id: 'new', days: 9 })], NOW);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).toMatchObject({ id: 'new', days: 9 });
  });

  it('deletedAt 字符串 → null（软删行会原样进 merge 路径）', () => {
    expect(sanitizeDict([d({ deletedAt: '0' })], NOW).rows[0]!.deletedAt).toBeNull();
  });

  it('缺 displayName → 用 dictKey 兜底', () => {
    expect(sanitizeDict([d({ displayName: undefined })], NOW).rows[0]!.displayName).toBe('牛奶');
  });
});
