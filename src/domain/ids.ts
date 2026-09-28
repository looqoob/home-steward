/**
 * 生成一个全局唯一 ID，用于所有实体的主键。
 *
 * 三级降级策略：`crypto.randomUUID()` → `crypto.getRandomValues()` →
 * `Date.now() + Math.random()`。**任何环境下都不抛错**，非安全上下文（http 非 localhost）
 * 也能工作（此时只能用第三级）。
 *
 * @returns 形如 'a1b2c3d4-…'（crypto 可用）或 'm1x…-k9z…' 的字符串。
 * @example newId() // '3f2a1c...'
 */
export function newId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  if (c && typeof c.getRandomValues === 'function') {
    const buf = new Uint8Array(16);
    c.getRandomValues(buf);
    return Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('');
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** 由字符串稳定映射到 32 位整数（用于把 itemId 转成通知 id） */
export function hashId(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h % 2147483647);
}
