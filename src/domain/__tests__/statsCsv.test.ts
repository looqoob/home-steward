import { describe, expect, it } from 'vitest';
import { buildStatsCsv } from '../statsCsv';
import type { MonthStats, StockValue, WastePoint, WastedTop, CategorySlice } from '../stats';

const overview: MonthStats = { inbound: 3, consumed: 10, wastedCount: 2, wastedAmount: 12.5 };
const trend: WastePoint[] = [
  { month: '2026-09', label: '9月', amount: 20, count: 2 },
  { month: '2026-10', label: '10月', amount: 0, count: 0 },
];
const top: WastedTop[] = [
  { name: '青菜', count: 2, amount: 8 },
  // 名称里带逗号与引号：RFC 4180 要求字段转义，否则 Excel 会拆列
  { name: '牛奶,特浓"1L"', count: 1, amount: 4.5 },
];
const categories: CategorySlice[] = [{ category: 'vegetable', label: '蔬菜', count: 4, percent: 0.667 }];
const value: StockValue = { total: 86, overAmount: 12, priced: 10, unpriced: 3 };

const csv = () =>
  buildStatsCsv({ monthLabel: '2026-10', overview, trend, top, categories, value });

describe('buildStatsCsv（v1.1 F2）', () => {
  it('★ 文件头带 BOM：没有它 Excel 打开中文必乱码', () => {
    expect(csv().startsWith('\uFEFF')).toBe(true);
  });

  it('行分隔是 CRLF（RFC 4180 / Excel 约定）', () => {
    expect(csv()).toContain('指标,数值\r\n入库件数,3');
  });

  it('各区块与数值齐全，展示口径与统计页一致', () => {
    const s = csv();
    expect(s).toContain('本月概览（2026-10）');
    expect(s).toContain('浪费金额,12.5');
    expect(s).toContain('2026-09,20,2');
    expect(s).toContain('青菜,2,8');
    expect(s).toContain('蔬菜,4,66.7%');
    expect(s).toContain('总价值（含已过期）,86');
    expect(s).toContain('未填单价件数（未计入金额）,3');
  });

  it('★ 含逗号/引号的字段按 RFC 4180 转义（双引号包裹 + 内部引号翻倍）', () => {
    expect(csv()).toContain('"牛奶,特浓""1L""",1,4.5');
  });

  it('空区块不输出（趋势/Top 数据不足时不导出空表头）', () => {
    const s = buildStatsCsv({ monthLabel: '2026-10', overview, trend: [], top: [], categories: [], value });
    expect(s).not.toContain('近月浪费趋势');
    expect(s).not.toContain('最常浪费');
    expect(s).not.toContain('在库品类分布');
  });
});
