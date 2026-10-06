import { describe, expect, it } from 'vitest';
import { planBulkConsume, planBulkMove, planBulkRemove } from '../bulk';
import { computeExpiry } from '../shelfLife';
import { NOT_RECOMMENDED } from '../types';
import type { EnvType } from '../types';
import { mkItem, ds, NOW } from './fixtures';

/** 字典解析器桩：固定返回 5 天 */
const resolve = () => ({ days: 5 as const, source: 'builtin' as const, reason: null });
const fallback = () => 7;

describe('planBulkConsume', () => {
  it('逐件写日志，金额 = 单价 × 数量（不是整份的钱）', () => {
    const { logs, items } = planBulkConsume(
      [mkItem({ id: 'x', name: '鸡蛋', qty: 3, price: 2 }), mkItem({ id: 'y', name: '牛奶', qty: 1, price: 5 })],
      'consumed',
      NOW,
    );
    expect(logs.map((l) => [l.name, l.quantity, l.price])).toEqual([
      ['鸡蛋', 3, 6],
      ['牛奶', 1, 5],
    ]);
    expect(items.every((i) => i.status === 'finished')).toBe(true);
  });

  it('跳过已删除项，日志与物品一一对应', () => {
    const { logs, items } = planBulkConsume(
      [mkItem({ id: 'x', name: '鸡蛋' }), mkItem({ id: 'y', name: '已删', deletedAt: NOW })],
      'wasted',
      NOW,
    );
    expect(logs).toHaveLength(1);
    expect(items).toHaveLength(1);
    expect(logs[0].type).toBe('wasted');
  });
});

describe('planBulkMove', () => {
  it('复用 computeExpiry：正常环境逐件重算到期日', () => {
    const [moved] = planBulkMove([mkItem({ id: 'x', name: '菠菜', expireIn: 5 })], 'L2', 'chilled', resolve, fallback, NOW);
    expect(moved.locationId).toBe('L2');
    expect(moved.expireAt).toBe(ds(5));
    expect(moved.shelfLifeDays).toBe(5);
  });

  it('env = none 时不计保质期（与逐条 moveTo 同分支）', () => {
    const [moved] = planBulkMove([mkItem({ id: 'x', name: '纸巾' })], 'L2', 'none', resolve, fallback, NOW);
    expect(moved.expireAt).toBeNull();
    expect(moved.shelfLifeDays).toBeNull();
  });

  it('手填保质期优先级最高，换位置不被字典覆盖', () => {
    const [moved] = planBulkMove(
      [mkItem({ id: 'x', name: '菠菜', manualShelfLife: 30 })],
      'L2',
      'chilled',
      resolve,
      fallback,
      NOW,
    );
    expect(moved.expireAt).toBe(ds(30));
    expect(moved.shelfLifeSource).toBe('manual');
  });

  it('不宜存放时置 notRecommended，不给出到期日', () => {
    const notRec = () => ({ days: NOT_RECOMMENDED, source: 'builtin' as const, reason: '冷冻会冻坏' });
    const [moved] = planBulkMove([mkItem({ id: 'x', name: '叶菜' })], 'L2', 'frozen', notRec, fallback, NOW);
    expect(moved.notRecommended).toBe(true);
    expect(moved.expireAt).toBeNull();
  });

  it('结果与逐条 computeExpiry 完全一致（防止两套算法漂移）', () => {
    const item = mkItem({ id: 'x', name: '菠菜', category: 'vegetable' });
    const [moved] = planBulkMove([item], 'L2', 'chilled', resolve, fallback, NOW);
    const solo = computeExpiry(
      { name: item.name, category: item.category, storedAt: item.storedAt, producedAt: null, manualShelfLife: null },
      'chilled' as EnvType,
      resolve,
      fallback,
    );
    expect(moved.expireAt).toBe(solo.expireAt);
    expect(moved.shelfLifeSource).toBe(solo.source);
  });
});

describe('planBulkRemove', () => {
  it('软删除且不写消耗日志，已删项被过滤', () => {
    const out = planBulkRemove([mkItem({ id: 'x' }), mkItem({ id: 'y', deletedAt: 1 })], NOW);
    expect(out).toHaveLength(1);
    expect(out[0].deletedAt).toBe(NOW);
  });
});
