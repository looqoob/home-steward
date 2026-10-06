import { describe, expect, it } from 'vitest';
import { bucketOf, groupByTimeline, BUCKET_LABEL, BUCKET_ORDER } from '../timeline';

/** 造一个只带分桶所需字段的最小对象 */
const f = (state: 'fresh' | 'soon' | 'urgent' | 'over' | 'warn' | 'none', remainDays: number | null) => ({
  state,
  remainDays,
});

describe('bucketOf', () => {
  it('已过期（负数）→ over', () => {
    expect(bucketOf(f('over', -3))).toBe('over');
  });
  it('今天 / 明天 / 2–7 天 / 更晚 按剩余天数精确落桶', () => {
    expect(bucketOf(f('urgent', 0))).toBe('today');
    expect(bucketOf(f('urgent', 1))).toBe('tomorrow');
    expect(bucketOf(f('soon', 2))).toBe('week');
    expect(bucketOf(f('soon', 7))).toBe('week');
    expect(bucketOf(f('fresh', 8))).toBe('later');
    expect(bucketOf(f('fresh', 300))).toBe('later');
  });
  it('无到期日 → none（未设保质期与不建议存放都归这里，与 groupOf 一致）', () => {
    expect(bucketOf(f('none', null))).toBe('none');
    expect(bucketOf(f('warn', null))).toBe('none');
  });

  it('⚠️ 边界：0 与 1 不可混为一谈（今天 ≠ 明天）', () => {
    expect(bucketOf(f('urgent', 0))).not.toBe(bucketOf(f('urgent', 1)));
  });
});

describe('groupByTimeline', () => {
  it('保持传入顺序，空桶自动跳过', () => {
    const rows = [
      f('over', -2),
      f('over', -1),
      f('urgent', 0),
      f('fresh', 40),
    ];
    const g = groupByTimeline(rows);
    expect(g.map((x) => x.bucket)).toEqual(['over', 'today', 'later']);
    expect(g[0]!.items).toHaveLength(2);
  });

  it('桶顺序恒定，恒为 BUCKET_ORDER 的子序列', () => {
    const g = groupByTimeline([f('fresh', 30), f('urgent', 0), f('none', null)]);
    const idx = g.map((x) => BUCKET_ORDER.indexOf(x.bucket));
    expect(idx).toEqual([...idx].sort((a, b) => a - b));
    expect(g.map((x) => x.bucket)).toEqual(['today', 'later', 'none']);
  });

  it('每个桶都带中文标签，可直接渲染', () => {
    const g = groupByTimeline([f('over', -1)]);
    expect(g[0]!.label).toBe(BUCKET_LABEL.over);
    expect(g[0]!.label).toBe('已过期');
  });

  it('空列表 → 空数组（页面显示空态，不报错）', () => {
    expect(groupByTimeline([])).toEqual([]);
  });
});
