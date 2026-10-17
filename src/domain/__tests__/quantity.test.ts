import { describe, expect, it } from 'vitest';
import { fmtQty } from '../quantity';
import { expiryPreviewText, type ExpiryResult } from '../shelfLife';

describe('fmtQty（数量显示统一口径）', () => {
  it('整数不补小数位', () => {
    expect(fmtQty(1)).toBe('1');
    expect(fmtQty(20)).toBe('20');
    expect(fmtQty(0)).toBe('0');
  });

  it('★ 非整数保留两位以内，不出现浮点尾巴', () => {
    // 数量加减后的 0.30000000000000004 是最经典的浮点尾巴
    expect(fmtQty(0.30000000000000004)).toBe('0.3');
    expect(fmtQty(0.5)).toBe('0.5');
    expect(fmtQty(1.25)).toBe('1.25');
  });

  it('第三位四舍五入', () => {
    expect(fmtQty(1.234)).toBe('1.23');
    expect(fmtQty(1.256)).toBe('1.26');
  });
});

/** 构造一个 computeExpiry 形状的结果，只填 expiryPreviewText 关心的字段 */
function result(partial: Partial<ExpiryResult> = {}): ExpiryResult {
  return {
    expireAt: null,
    days: null,
    source: 'builtin',
    notRecommended: false,
    reason: null,
    fallbackDays: null,
    ...partial,
  };
}

describe('expiryPreviewText（到期日三态预览文案）', () => {
  it('正常：N 天，到期日 M-D（去掉年份）', () => {
    expect(expiryPreviewText('牛奶', result({ expireAt: '2026-10-24', days: 7 }))).toBe(
      '牛奶 · 7 天，到期日 10-24',
    );
  });

  it('带环境标签时拼成「名称 · 环境 · …」', () => {
    expect(
      expiryPreviewText('牛奶', result({ expireAt: '2026-10-24', days: 7 }), { envLabel: '冷藏' }),
    ).toBe('牛奶 · 冷藏 · 7 天，到期日 10-24');
  });

  it('不建议存放：原因写进括号', () => {
    expect(
      expiryPreviewText('牛奶', result({ notRecommended: true, reason: '冷冻会破坏质地' }), {
        envLabel: '冷藏',
      }),
    ).toBe('牛奶 · 冷藏 · 不建议存放（冷冻会破坏质地）');
  });

  it('★ 默认空态是「未设置保质期（可到编辑页手填）」——入库流用户还能去编辑页补', () => {
    expect(expiryPreviewText('牛奶', result(), { envLabel: '冷藏' })).toBe(
      '牛奶 · 冷藏 · 未设置保质期（可到编辑页手填）',
    );
  });

  it('移库/扫码等提示性场景可传「不计入保质期」', () => {
    expect(expiryPreviewText('酒柜', result(), { unsetText: '不计入保质期' })).toBe(
      '酒柜 · 不计入保质期',
    );
  });
});
