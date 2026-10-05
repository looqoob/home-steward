/**
 * 食材名归一化：全角转半角、去括号及其内容、去空白、英文小写。
 *
 * 实现已迁至 `@/domain/normalize`（它不依赖任何数据源，属于领域逻辑）。
 * 本文件保留为转出层，避免既有引用（`stores/items`、`stores/dict` 等）失效。
 */
export { normalizeName, firstChar } from '@/domain/normalize';
