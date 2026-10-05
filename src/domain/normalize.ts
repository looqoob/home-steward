/**
 * 食材名归一化与图标工具（纯函数）。
 *
 * v2 调整：原先放在 `data/dict/normalize.ts`，但它不碰任何数据源，
 * 属于领域逻辑。`domain` 需要用它做「清单项 ↔ 历史物品」的名称匹配，
 * 若让 domain 反向依赖 data 会破坏既有分层（`domain → data → stores → views`）。
 * 因此逻辑迁到这里，`data/dict/normalize.ts` 改为转出以保持既有引用不失效。
 */

/** 全角转半角、去括号及其内容、去空白、英文小写 */
export function normalizeName(input: string): string {
  return input
    .trim()
    .replace(/[！-～]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/[（(][^（()）]*[)）]/g, '')
    .replace(/\s+/g, '')
    .toLowerCase();
}

/** 取首字作为默认图标文字 */
export function firstChar(name: string): string {
  const n = name.trim();
  return n ? Array.from(n)[0] : '?';
}
