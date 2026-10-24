import { describe, expect, it } from 'vitest';
import { createItem } from '../itemFactory';
import { normalizeName } from '../normalize';

const resolve = () => ({ days: 5 as const, source: 'builtin' as const, reason: null });
const fallback = () => 7;

describe('createItem · dictKey 折叠词根（REV-14）', () => {
  const input = { name: '西红柿', quantity: 1, unit: '个', locationId: 'L1' };

  it('★ 传 aliasKey 时 dictKey 取字典规范词根：别名「西红柿」定格为「番茄」', () => {
    const alias = (n: string) => (n === '西红柿' || n === '番茄' ? '番茄' : null);
    const item = createItem(input, 'chilled', resolve, fallback, 0, null, alias);
    expect(item.dictKey).toBe('番茄');
  });

  it('★ 不传 aliasKey 时回落 normalizeName（此前直接存原始名，别名折叠形同虚设）', () => {
    const item = createItem({ ...input, name: 'Ｔｏｍａｔｏ（番茄）' }, 'chilled', resolve, fallback);
    expect(item.dictKey).toBe(normalizeName('Ｔｏｍａｔｏ（番茄）'));
  });

  it('名字入库前 trim（与折叠键的归一口径一致）', () => {
    const item = createItem({ ...input, name: ' 西红柿 ' }, 'chilled', resolve, fallback);
    expect(item.name).toBe('西红柿');
  });

  it('到期日按解析结果落库：storedAt + 5 天', () => {
    const item = createItem(input, 'chilled', resolve, fallback, 0);
    // now = 0 → 本地时区的 1970-01-01（todayStr 走本地时区，CI 与本机都在东八区时恒定）
    expect(item.shelfLifeDays).toBe(5);
    expect(item.expireAt).not.toBeNull();
  });
});
