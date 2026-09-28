import type { CategoryKey, EnvType } from './types';

/** 品类默认值（第二级兜底）：字典未命中该环境时使用 */
export const CATEGORY_DEFAULTS: Record<CategoryKey, Partial<Record<EnvType, number>>> = {
  vegetable: { chilled: 5, cool: 3, ventilated: 2, frozen: 60 },
  fruit: { chilled: 7, cool: 4, ventilated: 3, frozen: 90 },
  meat: { chilled: 3, frozen: 90 },
  seafood: { chilled: 2, frozen: 120 },
  eggMilk: { chilled: 14, cool: 7 },
  soy: { chilled: 3, frozen: 60 },
  grainOil: { dry: 180, cool: 120, dark: 365 },
  dryGoods: { dry: 365, cool: 180, dark: 365 },
  seasoning: { dry: 365, cool: 365, dark: 365 },
  frozenFood: { frozen: 180, chilled: 1 },
  other: { cool: 30, dry: 180 },
};

/** 全局兜底（第三级） */
export const GLOBAL_DEFAULTS: Record<EnvType, number> = {
  chilled: 7,
  frozen: 90,
  cool: 30,
  dry: 180,
  ventilated: 30,
  dark: 180,
  none: -1,
};

const KEYWORDS: Array<[CategoryKey, string[]]> = [
  ['meat', ['肉', '排骨', '鸡', '鸭', '牛', '羊', '培根', '香肠', '火腿', '腊']],
  ['seafood', ['鱼', '虾', '蟹', '贝', '蛤', '蚝', '鱿', '海参', '带鱼']],
  ['eggMilk', ['蛋', '奶', '酸奶', '奶酪', '奶油', '黄油', '豆浆']],
  ['soy', ['豆腐', '豆干', '豆皮', '腐竹', '豆芽']],
  ['grainOil', ['米', '面', '粉', '油', '面包', '馒头', '饺']],
  ['dryGoods', ['干', '木耳', '银耳', '枣', '枸杞', '桂圆', '花生', '核桃', '腰果', '开心果', '杏仁', '芝麻', '茶']],
  ['seasoning', ['盐', '糖', '酱油', '醋', '料酒', '酱', '花椒', '八角', '胡椒', '淀粉', '味精', '蜂蜜']],
  ['frozenFood', ['速冻', '冷冻', '汤圆', '冰淇淋']],
  ['fruit', ['苹果', '香蕉', '橙', '橘', '柠檬', '葡萄', '草莓', '蓝莓', '西瓜', '瓜', '梨', '桃', '李', '樱桃', '猕猴桃', '芒果', '菠萝', '火龙果', '柚子', '柿子', '石榴', '荔枝', '榴莲', '木瓜', '百香果', '提子']],
  ['vegetable', ['菜', '萝卜', '土豆', '西红柿', '番茄', '黄瓜', '菇', '葱', '蒜', '姜', '椒', '豆角', '南瓜', '冬瓜', '藕', '笋', '芋', '山药', '秋葵', '芦笋']],
];

/** 按关键词猜测品类（字典未命中食材时使用） */
export function guessCategory(name: string): CategoryKey | null {
  for (const [cat, words] of KEYWORDS) {
    if (words.some((w) => name.includes(w))) return cat;
  }
  return null;
}

/** 「不建议」环境下的保守建议天数（提示「若坚持存放」用） */
export function fallbackDays(env: EnvType, category: CategoryKey | null): number | null {
  if (category) {
    const v = CATEGORY_DEFAULTS[category]?.[env];
    if (v !== undefined && v > 0) return v;
  }
  const g = GLOBAL_DEFAULTS[env];
  return g && g > 0 ? g : null;
}
