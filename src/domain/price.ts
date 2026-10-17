/**
 * 金额口径（**全项目唯一定义**）。
 *
 * ## 为什么单独开一个模块
 *
 * 之前「单价怎么算合法」「本次金额怎么算」散在四处，且规则各不相同：
 *
 * - `domain/bulk.buildConsumeLog`：`round2(item.price * take)`，单价为 `null` 时给 `null`
 * - `components/ConsumeSheet`：`Math.round(item.price * qty * 100) / 100`
 * - `components/GroupConsumeSheet`：同上，再抄一遍
 * - `data/backup/sanitize`：只校验了**日志**侧的 `price`，物品侧的单价原样穿透
 *
 * 前三处还算同心，第四处直接漏了 —— 一份手改过的备份里 `"price": "12.5"` 会原样进库，
 * 之后 `price * 数量` 得 `NaN`，整月「浪费金额」跟着烂掉。
 * 这正是 `buildConsumeLog` 注释里警告过的「两份实现漂移」，只不过漂在了更上游。
 *
 * 所以金额规则集中在这里：**单价必须归一化，本次金额必须走 `amountOf`**。
 *
 * ## 三条约定
 *
 * 1. **`null` = 没填价，`0` = 真的免费。** 两者绝不能混——统计里把「没填价」当 0 累加，
 *    会让「浪费金额」看起来是个真实数字，实际只统计了填过价的那部分。
 * 2. **单价是有限非负数。** 负数会把月度统计拉成负数，`Infinity` 会让它永久显示 `¥Infinity`。
 * 3. **日志存快照。** `ConsumeLog.price` 是「本次金额」（单价 × 本次数量），
 *    `ConsumeLog.unitPrice` 是消耗当时的单价；事后改物品单价**不改历史日志**。
 */

/** 两位小数取整（金额与数量共用；避免浮点累加出 `0.30000000000000004` 这种数）。
 *  对 NaN / Infinity 兜底返回 0，避免脏值在统计页渲染成 "NaN" / "Infinity"。 */
export function round2(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

/**
 * 单价 / 金额归一化：有限非负数原样保留，**其余一律 `null`**。
 *
 * 挡的是这几类：`NaN`、`Infinity`、`-Infinity`、负数、以及外部数据里的字符串 / 对象。
 *
 * @example
 * normalizePrice(3.5)      // 3.5
 * normalizePrice(0)        // 0（真的免费，不是没填）
 * normalizePrice(-5)       // null
 * normalizePrice(Infinity) // null
 * normalizePrice('12.5')   // null
 */
export function normalizePrice(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null;
}

/**
 * `<input type="number">` 的字符串 → 单价。
 *
 * 表单入口一律走它，不要各自写 `Number(v)`：`min="0"` 只是 HTML 校验，
 * 挡不住手输 `-5`，`1e999` 也会变成 `Infinity` —— 两者都能写进库。
 *
 * @param raw 输入框的 `value`。空串 / 空白 → `null`（对应「没填」）
 */
export function priceFromInput(raw: string): number | null {
  if (!raw.trim()) return null;
  return normalizePrice(Number(raw));
}

/**
 * 数量归一化：有限正数原样保留，**其余一律 0**。
 *
 * 与 `normalizePrice` 的区别：`normalizePrice` 对非法值返回 `null`（「没填价」有语义意义），
 * 数量没有「没填」这个语义，非法一律塌成 0。挡的是 NaN / Infinity / 负数 / 字符串，
 * 避免脏 `item.quantity` 经 `amountOf` / 统计累加放大成 NaN。
 *
 * @example normalizeQty(3)    // 3
 * @example normalizeQty(NaN)  // 0
 * @example normalizeQty(-1)   // 0
 */
export function normalizeQty(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0;
}

/**
 * 本次金额 = 单价 × 数量。
 *
 * ⚠️ 乘以数量是**必须的**：`Item.price` 的语义是**单价**，直接拿它当金额的话，
 * 「20 个鸡蛋扔掉 2 个」会算成整份 20 个的钱。
 *
 * @param unitPrice 单价；`null` / `undefined`（没填价）→ 返回 `null`，不是 0
 * @returns 两位小数的本次金额；单价为空时返回 `null`
 * @example
 * amountOf(2.5, 2)  // 5
 * amountOf(null, 2) // null
 */
export function amountOf(unitPrice: number | null | undefined, qty: number): number | null {
  const p = normalizePrice(unitPrice);
  if (p === null) return null;
  return round2(p * normalizeQty(qty));
}

/**
 * 单价的**展示**文案：`¥1.5/斤`。
 *
 * 放在这里而不是各组件里各拼一遍，是为了让列表 / 组卡 / 详情说的是同一句话。
 *
 * ⚠️ 没填价返回**空串**而不是「未填价」：卡片已经很密，
 * 「没有价格」不值得占一行 —— 用户关心的是「这东西多少钱」，不是「我没填」。
 * 真正需要区分「没填价」vs「真的免费」的地方是统计页，那里由脚注负责说明。
 *
 * @example
 * unitPriceText(1.5, '斤')  // '¥1.5/斤'
 * unitPriceText(null, '斤') // ''
 */
export function unitPriceText(unitPrice: number | null | undefined, unit: string): string {
  const p = normalizePrice(unitPrice);
  if (p === null) return '';
  return `¥${round2(p)}/${unit || '个'}`;
}
