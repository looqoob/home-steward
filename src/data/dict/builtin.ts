import type { CategoryKey, EnvType } from '@/domain/types';
import { NOT_RECOMMENDED } from '@/domain/types';

export interface BuiltinFood {
  key: string;
  aliases: string[];
  category: CategoryKey;
  envs: Partial<Record<EnvType, number>>;
  notRecommendedReason?: Partial<Record<EnvType, string>>;
}

type Row = [
  key: string,
  category: CategoryKey,
  envs: Partial<Record<EnvType, number>>,
  aliases?: string[],
  reasons?: Partial<Record<EnvType, string>>,
];

/**
 * 内置保质期字典：稀疏矩阵，只写有把握的「食材 × 环境」组合。
 * -1 表示该食材不宜放此环境（NOT_RECOMMENDED），配 reason 展示给用户。
 * 未覆盖的组合交给品类默认值 → 全局默认值兜底。
 */
const ROWS: Row[] = [
  // ---- 蔬菜 ----
  ['西红柿', 'vegetable', { chilled: 7, cool: 4, ventilated: 3 }, ['番茄', '圣女果']],
  ['土豆', 'vegetable', { chilled: NOT_RECOMMENDED, frozen: NOT_RECOMMENDED, cool: 30, dry: 30, ventilated: 20, dark: 25 }, ['马铃薯', '洋芋'], { chilled: '冷藏易发芽、口感变甜', frozen: '冻后质地粉化' }],
  ['黄瓜', 'vegetable', { chilled: 5, cool: 3 }, ['青瓜']],
  ['胡萝卜', 'vegetable', { chilled: 14, cool: 7, ventilated: 5 }],
  ['白菜', 'vegetable', { chilled: 7, cool: 5 }, ['大白菜']],
  ['菠菜', 'vegetable', { chilled: 3, cool: 1, frozen: 60 }],
  ['生菜', 'vegetable', { chilled: 4, cool: 2 }],
  ['芹菜', 'vegetable', { chilled: 7, cool: 3 }],
  ['茄子', 'vegetable', { chilled: 5, cool: 3 }],
  ['青椒', 'vegetable', { chilled: 7, cool: 4 }, ['柿子椒', '彩椒']],
  ['洋葱', 'vegetable', { chilled: 14, cool: 30, dry: 60, ventilated: 45 }],
  ['大蒜', 'vegetable', { chilled: 7, cool: 30, dry: 90, ventilated: 60 }, ['蒜头']],
  ['姜', 'vegetable', { chilled: 14, cool: 20, dry: 30 }, ['生姜']],
  ['葱', 'vegetable', { chilled: 7, cool: 3 }, ['小葱', '大葱']],
  ['韭菜', 'vegetable', { chilled: 3, cool: 1 }],
  ['豆角', 'vegetable', { chilled: 5, cool: 3, frozen: 90 }, ['四季豆', '豇豆']],
  ['西兰花', 'vegetable', { chilled: 5, cool: 2, frozen: 90 }],
  ['花菜', 'vegetable', { chilled: 7, cool: 3 }, ['菜花']],
  ['白萝卜', 'vegetable', { chilled: 14, cool: 7 }, ['萝卜']],
  ['南瓜', 'vegetable', { chilled: 10, cool: 30, dry: 60 }],
  ['冬瓜', 'vegetable', { chilled: 7, cool: 15 }],
  ['蘑菇', 'vegetable', { chilled: 4, cool: 2 }, ['口蘑']],
  ['豆芽', 'vegetable', { chilled: 2, cool: 1 }],
  ['香菜', 'vegetable', { chilled: 5, cool: 2 }],
  ['辣椒', 'vegetable', { chilled: 7, cool: 4, dry: 30 }, ['小米辣']],
  ['玉米', 'vegetable', { chilled: 5, cool: 2, frozen: 180 }],
  ['豌豆', 'vegetable', { chilled: 4, frozen: 180 }, ['青豆']],
  ['山药', 'vegetable', { chilled: 14, cool: 30, dry: 30 }],
  ['莲藕', 'vegetable', { chilled: 7, cool: 4 }, ['藕']],
  ['芋头', 'vegetable', { chilled: NOT_RECOMMENDED, cool: 15, dry: 30 }, [], { chilled: '低温易冻伤' }],
  ['苦瓜', 'vegetable', { chilled: 5, cool: 3 }],
  ['丝瓜', 'vegetable', { chilled: 4, cool: 2 }],
  ['莴笋', 'vegetable', { chilled: 5, cool: 2 }],
  ['空心菜', 'vegetable', { chilled: 2, cool: 1 }],
  ['娃娃菜', 'vegetable', { chilled: 7, cool: 4 }],
  ['香菇', 'vegetable', { chilled: 5, cool: 2 }],
  ['金针菇', 'vegetable', { chilled: 4, cool: 2 }],
  ['秋葵', 'vegetable', { chilled: 4, cool: 2 }],
  ['芦笋', 'vegetable', { chilled: 4, cool: 2 }],
  ['蒜薹', 'vegetable', { chilled: 7, cool: 3 }],
  ['毛豆', 'vegetable', { chilled: 3, frozen: 180 }],
  ['紫甘蓝', 'vegetable', { chilled: 14, cool: 7 }],
  ['西葫芦', 'vegetable', { chilled: 5, cool: 3 }],

  // ---- 水果 ----
  ['苹果', 'fruit', { chilled: 30, cool: 10, ventilated: 7 }],
  ['香蕉', 'fruit', { chilled: NOT_RECOMMENDED, cool: 5, ventilated: 4 }, [], { chilled: '冷藏易冻伤发黑' }],
  ['橙子', 'fruit', { chilled: 30, cool: 10, ventilated: 7 }],
  ['橘子', 'fruit', { chilled: 20, cool: 7, ventilated: 5 }, ['桔子', '柑橘']],
  ['柠檬', 'fruit', { chilled: 30, cool: 10 }],
  ['葡萄', 'fruit', { chilled: 7, cool: 3 }, ['提子']],
  ['草莓', 'fruit', { chilled: 3, cool: 1, frozen: 180 }],
  ['蓝莓', 'fruit', { chilled: 10, cool: 3, frozen: 180 }],
  ['西瓜', 'fruit', { chilled: 7, cool: 3 }],
  ['哈密瓜', 'fruit', { chilled: 7, cool: 4 }],
  ['梨', 'fruit', { chilled: 20, cool: 7 }],
  ['桃', 'fruit', { chilled: 5, cool: 3 }, ['水蜜桃']],
  ['李子', 'fruit', { chilled: 7, cool: 3 }],
  ['樱桃', 'fruit', { chilled: 4, cool: 2 }],
  ['猕猴桃', 'fruit', { chilled: 20, cool: 7 }, ['奇异果']],
  ['芒果', 'fruit', { chilled: NOT_RECOMMENDED, cool: 5, ventilated: 4 }, [], { chilled: '低温易冷害发黑' }],
  ['菠萝', 'fruit', { chilled: 5, cool: 3 }, ['凤梨']],
  ['火龙果', 'fruit', { chilled: 10, cool: 5 }],
  ['柚子', 'fruit', { chilled: 45, cool: 30, ventilated: 20 }],
  ['柿子', 'fruit', { chilled: 10, cool: 5 }],
  ['石榴', 'fruit', { chilled: 30, cool: 10 }],
  ['荔枝', 'fruit', { chilled: 3, cool: 1, frozen: 180 }],
  ['榴莲', 'fruit', { chilled: 5, frozen: 90 }],
  ['木瓜', 'fruit', { chilled: 5, cool: 3 }],
  ['百香果', 'fruit', { chilled: 14, cool: 7 }],

  // ---- 肉禽 ----
  ['猪肉', 'meat', { chilled: 3, frozen: 90 }],
  ['牛肉', 'meat', { chilled: 3, frozen: 180 }],
  ['羊肉', 'meat', { chilled: 3, frozen: 180 }],
  ['鸡胸肉', 'meat', { chilled: 2, frozen: 90 }],
  ['鸡腿', 'meat', { chilled: 2, frozen: 90 }],
  ['鸡翅', 'meat', { chilled: 2, frozen: 90 }],
  ['整鸡', 'meat', { chilled: 2, frozen: 180 }],
  ['排骨', 'meat', { chilled: 3, frozen: 120 }],
  ['五花肉', 'meat', { chilled: 3, frozen: 90 }],
  ['牛腩', 'meat', { chilled: 3, frozen: 180 }],
  ['肉馅', 'meat', { chilled: 1, frozen: 60 }, ['肉末', '绞肉']],
  ['培根', 'meat', { chilled: 7, frozen: 60 }],
  ['香肠', 'meat', { chilled: 14, frozen: 180 }],
  ['火腿', 'meat', { chilled: 14, frozen: 90 }],
  ['腊肉', 'meat', { chilled: 30, cool: 60, dry: 90, frozen: 180 }],
  ['鸭肉', 'meat', { chilled: 2, frozen: 120 }],
  ['鸡肝', 'meat', { chilled: 1, frozen: 60 }],

  // ---- 水产 ----
  ['鱼', 'seafood', { chilled: 2, frozen: 120 }],
  ['虾', 'seafood', { chilled: 2, frozen: 120 }],
  ['虾仁', 'seafood', { chilled: 2, frozen: 180 }],
  ['蟹', 'seafood', { chilled: 1, frozen: 60 }],
  ['带鱼', 'seafood', { chilled: 2, frozen: 180 }],
  ['三文鱼', 'seafood', { chilled: 2, frozen: 60 }],
  ['鲈鱼', 'seafood', { chilled: 2, frozen: 120 }],
  ['黄花鱼', 'seafood', { chilled: 2, frozen: 180 }],
  ['鱿鱼', 'seafood', { chilled: 2, frozen: 120 }],
  ['蛤蜊', 'seafood', { chilled: 1, frozen: 60 }, ['花蛤']],
  ['生蚝', 'seafood', { chilled: 2, frozen: 60 }, ['牡蛎']],
  ['海参', 'seafood', { frozen: 365 }],
  ['鱼丸', 'seafood', { chilled: 5, frozen: 180 }],

  // ---- 蛋奶 ----
  ['鸡蛋', 'eggMilk', { chilled: 40, cool: 15 }],
  ['鸭蛋', 'eggMilk', { chilled: 30, cool: 10 }],
  ['牛奶', 'eggMilk', { chilled: 7, cool: 2 }],
  ['酸奶', 'eggMilk', { chilled: 14, cool: 3 }],
  ['奶酪', 'eggMilk', { chilled: 30, frozen: 180 }],
  ['奶油', 'eggMilk', { chilled: 7, frozen: 180 }],
  ['黄油', 'eggMilk', { chilled: 60, frozen: 365 }],
  ['豆浆', 'eggMilk', { chilled: 2, cool: 1 }],

  // ---- 豆制品 ----
  ['豆腐', 'soy', { chilled: 3, frozen: 60 }],
  ['豆干', 'soy', { chilled: 5, frozen: 90 }],
  ['豆皮', 'soy', { chilled: 5, frozen: 90 }],
  ['腐竹', 'soy', { dry: 180, cool: 90 }],

  // ---- 米面粮油 ----
  ['大米', 'grainOil', { dry: 180, cool: 120, dark: 365 }],
  ['面粉', 'grainOil', { dry: 180, cool: 120 }],
  ['挂面', 'grainOil', { dry: 365, cool: 180 }],
  ['面条', 'grainOil', { chilled: 5, dry: 180, cool: 30 }],
  ['小米', 'grainOil', { dry: 180, cool: 120 }],
  ['玉米面', 'grainOil', { dry: 180, cool: 120 }],
  ['食用油', 'grainOil', { dark: 365, cool: 365, dry: 365 }],
  ['橄榄油', 'grainOil', { dark: 540, cool: 540 }],
  ['香油', 'grainOil', { dark: 365, cool: 365 }],
  ['面包', 'grainOil', { chilled: 7, cool: 3, frozen: 90 }],
  ['馒头', 'grainOil', { chilled: 7, cool: 2, frozen: 90 }],
  ['饺子皮', 'grainOil', { chilled: 3, frozen: 90 }],

  // ---- 干货 ----
  ['木耳', 'dryGoods', { dry: 365, cool: 180 }],
  ['干香菇', 'dryGoods', { dry: 365, cool: 180 }],
  ['银耳', 'dryGoods', { dry: 365, cool: 180 }],
  ['红枣', 'dryGoods', { dry: 365, cool: 180 }, ['大枣']],
  ['枸杞', 'dryGoods', { dry: 365, cool: 180 }],
  ['桂圆', 'dryGoods', { dry: 365, cool: 180 }],
  ['花生', 'dryGoods', { dry: 180, cool: 120 }],
  ['核桃', 'dryGoods', { dry: 180, cool: 120, frozen: 365 }],
  ['腰果', 'dryGoods', { dry: 180, cool: 120 }],
  ['开心果', 'dryGoods', { dry: 180, cool: 120 }],
  ['杏仁', 'dryGoods', { dry: 180, cool: 120 }],
  ['芝麻', 'dryGoods', { dry: 365, cool: 180 }],
  ['粉丝', 'dryGoods', { dry: 365, cool: 180 }],
  ['海带', 'dryGoods', { dry: 365, cool: 180 }],
  ['紫菜', 'dryGoods', { dry: 365, cool: 180 }],
  ['干辣椒', 'dryGoods', { dry: 365, cool: 180 }],
  ['茶叶', 'dryGoods', { dry: 365, dark: 540, cool: 180 }],

  // ---- 调味 ----
  ['盐', 'seasoning', { dry: 3650, cool: 3650 }],
  ['糖', 'seasoning', { dry: 3650, cool: 3650 }],
  ['酱油', 'seasoning', { cool: 730, dark: 730, chilled: 730 }],
  ['醋', 'seasoning', { cool: 1095, dark: 1095 }],
  ['料酒', 'seasoning', { cool: 365, dark: 365 }],
  ['蚝油', 'seasoning', { chilled: 180, cool: 90 }],
  ['豆瓣酱', 'seasoning', { chilled: 180, cool: 90 }],
  ['番茄酱', 'seasoning', { chilled: 180, cool: 90 }],
  ['辣椒酱', 'seasoning', { chilled: 180, cool: 90 }],
  ['芝麻酱', 'seasoning', { chilled: 180, cool: 90 }],
  ['花椒', 'seasoning', { dry: 365, cool: 180 }],
  ['八角', 'seasoning', { dry: 365, cool: 180 }],
  ['胡椒粉', 'seasoning', { dry: 365, cool: 180 }],
  ['淀粉', 'seasoning', { dry: 730, cool: 365 }],
  ['味精', 'seasoning', { dry: 1095, cool: 730 }],
  ['蜂蜜', 'seasoning', { cool: 730, dark: 730 }],

  // ---- 冷冻食品 ----
  ['速冻水饺', 'frozenFood', { frozen: 180, chilled: 2 }, ['水饺']],
  ['汤圆', 'frozenFood', { frozen: 180, chilled: 2 }],
  ['包子', 'frozenFood', { frozen: 90, chilled: 2 }],
  ['手抓饼', 'frozenFood', { frozen: 180, chilled: 3 }],
  ['冰淇淋', 'frozenFood', { frozen: 365 }],
  ['速冻蔬菜', 'frozenFood', { frozen: 180 }],

  // ---- 其他 ----
  ['剩饭剩菜', 'other', { chilled: 2, frozen: 30 }, ['剩菜']],
];

export const BUILTIN_FOODS: BuiltinFood[] = ROWS.map(([key, category, envs, aliases, reasons]) => ({
  key,
  aliases: aliases ?? [],
  category,
  envs,
  notRecommendedReason: reasons,
}));

/** 快速录入的高频食材（3×3 九宫格） */
export const QUICK_FOODS = [
  '西红柿',
  '鸡蛋',
  '土豆',
  '大蒜',
  '洋葱',
  '大米',
  '鸡胸肉',
  '豆腐',
  '牛奶',
] as const;

/** 内置字典版本：改动内置数据时要 +1 */
export const BUILTIN_DICT_VERSION = 1;
