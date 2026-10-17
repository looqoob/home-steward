/**
 * 数量显示的统一格式化。
 *
 * 「整数不带小数位、非整数保留 ≤2 位」这个口径以前在 6 个组件里各抄一份
 * （ConsumeSheet / GroupConsumeSheet / ItemGroupCard / ShoppingInboundRow /
 * StocktakePanel / StockView），将来要改成「保留 3 位」或「带千分位」时，
 * 只改这一个函数即可。
 */

/**
 * 数量显示：整数不补小数位，0.5 这类保留两位以内。
 *
 * 为什么要四舍五入到两位：数量加减走 `round2`，但用户手输可能带出
 * 0.30000000000000004 这类浮点尾巴；显示前归一，视图层不再各自处理。
 *
 * 对 NaN / Infinity 兜底返回 `'0'`：上游如果因脏数据传入了非法数量，
 * UI 不应该渲染出 "NaN 个" 这种字符串。
 */
export function fmtQty(n: number): string {
  if (!Number.isFinite(n)) return '0';
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}
