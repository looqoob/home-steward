import { describe, expect, it } from 'vitest';
import { amountOf, fmtMoney, normalizePrice, priceFromInput, round2, unitPriceText } from '../price';

describe('round2', () => {
  it('抹掉浮点误差', () => {
    expect(round2(0.1 + 0.2)).toBe(0.3);
    expect(round2(1.234)).toBe(1.23);
    expect(round2(2)).toBe(2);
    expect(round2(0)).toBe(0);
  });
});

describe('normalizePrice', () => {
  it('有限非负数原样保留', () => {
    expect(normalizePrice(0)).toBe(0);
    expect(normalizePrice(3.5)).toBe(3.5);
    expect(normalizePrice(0.01)).toBe(0.01);
  });

  it('★ 0 与 null 必须区分开：0 = 真的免费，null = 没填价', () => {
    // 这是整套金额口径的地基——把「没填」当 0 累加，浪费金额会变成一个假的真实数字
    expect(normalizePrice(0)).not.toBeNull();
    expect(normalizePrice(null)).toBeNull();
    expect(normalizePrice(undefined)).toBeNull();
  });

  it('负数 / NaN / Infinity 一律 null', () => {
    expect(normalizePrice(-5)).toBeNull();
    expect(normalizePrice(-0.01)).toBeNull();
    expect(normalizePrice(NaN)).toBeNull();
    expect(normalizePrice(Infinity)).toBeNull();
    expect(normalizePrice(-Infinity)).toBeNull();
  });

  it('★ 外部数据的字符串金额 → null（备份导入走过这条）', () => {
    // 手改过的备份里 "12.5" 若原样进库，price * 数量 = NaN，整月统计烂掉
    expect(normalizePrice('12.5')).toBeNull();
    expect(normalizePrice({})).toBeNull();
    expect(normalizePrice([])).toBeNull();
    expect(normalizePrice(true)).toBeNull();
  });
});

describe('priceFromInput', () => {
  it('空串 / 空白 → null（对应「没填」）', () => {
    expect(priceFromInput('')).toBeNull();
    expect(priceFromInput('   ')).toBeNull();
  });

  it('合法数字字符串 → 数字', () => {
    expect(priceFromInput('3.5')).toBe(3.5);
    expect(priceFromInput('0')).toBe(0);
    expect(priceFromInput(' 12 ')).toBe(12);
  });

  it('★ min="0" 是 HTML 校验，挡不住手输负数', () => {
    expect(priceFromInput('-5')).toBeNull();
  });

  it('★ 1e999 会变 Infinity，必须挡住', () => {
    expect(priceFromInput('1e999')).toBeNull();
    expect(priceFromInput('abc')).toBeNull();
  });
});

describe('amountOf', () => {
  it('本次金额 = 单价 × 数量（不是整份的钱）', () => {
    expect(amountOf(2.5, 2)).toBe(5);
    // 20 个鸡蛋单价 1.5，扔掉 2 个 = 3 元，不是 30 元
    expect(amountOf(1.5, 2)).toBe(3);
  });

  it('★ 没填价 → null，不是 0', () => {
    expect(amountOf(null, 2)).toBeNull();
    expect(amountOf(undefined, 2)).toBeNull();
  });

  it('单价 0（真的免费）→ 金额 0，保留', () => {
    expect(amountOf(0, 2)).toBe(0);
  });

  it('两位小数，且脏单价不产生 NaN 金额', () => {
    expect(amountOf(0.1, 3)).toBe(0.3);
    expect(amountOf(-5, 2)).toBeNull();
    expect(amountOf(Infinity, 2)).toBeNull();
  });
});

describe('unitPriceText（列表/组卡的单价展示）', () => {
  it('带单位：¥1.5/斤', () => {
    expect(unitPriceText(1.5, '斤')).toBe('¥1.5/斤');
    expect(unitPriceText(3, '个')).toBe('¥3/个');
  });

  it('★ 没填价返回空串，不显示「未填价」占位', () => {
    // 卡片已经很密，「没有价格」不值得占一行
    expect(unitPriceText(null, '个')).toBe('');
    expect(unitPriceText(undefined, '个')).toBe('');
  });

  it('脏单价（负数 / 字符串）同样返回空串', () => {
    expect(unitPriceText(-5, '个')).toBe('');
    expect(unitPriceText('3' as unknown as number, '个')).toBe('');
  });

  it('单位为空兜底成「个」', () => {
    expect(unitPriceText(2, '')).toBe('¥2/个');
  });

  it('单价 0（真的免费）要显示出来，不能被当成没填', () => {
    expect(unitPriceText(0, '个')).toBe('¥0/个');
  });
});

describe('fmtMoney（金额展示文案，v1.1 F14）', () => {
  it('★ 恒定两位小数 + ¥ 前缀', () => {
    expect(fmtMoney(12.3)).toBe('¥12.30');
    expect(fmtMoney(0.005)).toBe('¥0.01');
  });
  it('没填价是 -，0 是真的免费（语义必须区分）', () => {
    expect(fmtMoney(null)).toBe('-');
    expect(fmtMoney(undefined)).toBe('-');
    expect(fmtMoney(0)).toBe('¥0.00');
  });
  it('脏值（负数 / NaN / 字符串）按没填价处理', () => {
    expect(fmtMoney(-5)).toBe('-');
    expect(fmtMoney(NaN)).toBe('-');
  });
});
