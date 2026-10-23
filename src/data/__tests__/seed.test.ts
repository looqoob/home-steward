import { describe, expect, it } from 'vitest';
import { ensureSeed, PRESET_LOCATIONS } from '../seed';
import type { DataSources } from '../repository';
import type { Location } from '@/domain/types';

/**
 * 只实现 `ensureSeed` 用到的两个方法：`countAll()`（含软删除行）与 `bulkPut`。
 * 刻意不做真正的 DataSources —— 这个用例要钉的是「判据用没用 countAll」，
 * 一旦实现回退到 `all()`（过滤软删除），下面「删光了也不再重播」那条会立刻红。
 */
function fakeDb(initial: Location[]) {
  const store = [...initial];
  const db = {
    locations: {
      countAll: async () => store.length,
      all: async () => store.filter((l) => !l.deletedAt),
      bulkPut: async (rows: Location[]) => {
        store.push(...rows);
      },
    },
  } as unknown as DataSources;
  return { db, store };
}

const loc = (id: string, deletedAt: number | null = null): Location => ({
  id,
  name: `位置${id}`,
  icon: '冷',
  env: 'chilled',
  sort: 10,
  enabled: true,
  builtin: false,
  createdAt: 1,
  updatedAt: 1,
  deletedAt,
});

describe('ensureSeed', () => {
  it('全新安装（一行都没有）→ 写入全部预设', async () => {
    const { db, store } = fakeDb([]);
    await ensureSeed(db);
    expect(store).toHaveLength(PRESET_LOCATIONS.length);
    expect(store.map((l) => l.name)).toEqual(PRESET_LOCATIONS.map((p) => p.name));
  });

  it('已有位置（且未删除）→ 一个都不加', async () => {
    const { db, store } = fakeDb([loc('a')]);
    await ensureSeed(db);
    expect(store).toHaveLength(1);
  });

  it('★ 用户把位置全删光（只剩软删除行）→ 不再重播预设', async () => {
    const { db, store } = fakeDb([loc('a', 100), loc('b', 200)]);
    await ensureSeed(db);
    expect(store).toHaveLength(2);
    expect(store.every((l) => l.deletedAt !== null)).toBe(true);
  });
});
