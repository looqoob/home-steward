import { describe, expect, it } from 'vitest';
import { fallbackDays, guessCategory } from '../categories';
import type { CategoryKey } from '../types';

/**
 * 表驱动：关键词表是**顺序敏感**的，下面这些名字都同时含两个品类的字。
 *
 * 每加/改一条关键词都要回来过一遍这张表 —— 这是唯一能把「顺序」钉住的测试
 * （改顺序造成的问题不会报错，只会让保质期悄悄错成另一个数量级）。
 */
const CASES: Array<[string, CategoryKey | null]> = [
  // 蛋奶 vs 肉：「鸡」「牛」既是肉类关键词，也出现在蛋奶名里
  ['土鸡蛋', 'eggMilk'],
  ['咸鸭蛋', 'eggMilk'],
  ['有机牛奶', 'eggMilk'],
  ['自制酸奶', 'eggMilk'],
  ['鸡蛋', 'eggMilk'],
  // 肉仍然要判成肉（不能为了救鸡蛋把肉一起救没了）
  ['鸡胸肉', 'meat'],
  ['三黄鸡', 'meat'],
  ['鸭腿', 'meat'],
  ['牛排', 'meat'],
  ['羊排', 'meat'],
  // 「牛」不再单独当肉类关键词，否则牛油果会判成肉
  ['牛油果', 'fruit'],
  // 蔬菜 vs 水果：「瓜」两边都有
  ['贝贝南瓜', 'vegetable'],
  ['黄瓜条', 'vegetable'],
  ['丝瓜', 'vegetable'],
  ['西瓜', 'fruit'],
  ['哈密瓜', 'fruit'],
  // 冷冻 vs 粮油：「速冻饺子」不能掉进「饺」被当成干货
  ['速冻饺子', 'frozenFood'],
  ['汤圆', 'frozenFood'],
  // 常规项不回归
  ['三文鱼', 'seafood'],
  ['豆腐', 'soy'],
  ['生抽酱油', 'seasoning'],
  ['东北大米', 'grainOil'],
  ['银耳', 'dryGoods'],
  ['苹果', 'fruit'],
  ['番茄', 'vegetable'],
  // 看不出来就不猜，交给字典 / 全局兜底
  ['不知名食材', null],
];

describe('guessCategory 的顺序敏感用例', () => {
  it.each(CASES)('%s → %s', (name, expected) => {
    expect(guessCategory(name)).toBe(expected);
  });

  it('顺序错了会直接改变保质期：鸡蛋按蛋奶是 14 天，按肉只有 3 天', () => {
    expect(fallbackDays('chilled', 'eggMilk')).toBe(14);
    expect(fallbackDays('chilled', 'meat')).toBe(3);
  });
});
