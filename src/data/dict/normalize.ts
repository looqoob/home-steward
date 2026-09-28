/** 食材名归一化：全角转半角、去括号及其内容、去空白、英文小写 */
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
