import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { db } from '@/data';
import type { EnvType, Location } from '@/domain/types';
import { newId } from '@/domain/ids';
import { canDeleteLocation, countInLocation, nextSort } from '@/domain/locationRules';

export interface NewLocationInput {
  name: string;
  icon: string;
  env: EnvType;
}

export const useLocationsStore = defineStore('locations', () => {
  const list = ref<Location[]>([]);
  const loaded = ref(false);

  const all = computed(() => list.value.filter((l) => !l.deletedAt).sort((a, b) => a.sort - b.sort));
  const enabled = computed(() => all.value.filter((l) => l.enabled));

  async function load() {
    list.value = await db.locations.all();
    loaded.value = true;
  }

  function byId(id: string): Location | undefined {
    return list.value.find((l) => l.id === id && !l.deletedAt);
  }

  /**
   * 取位置对应的环境。位置不存在时**返回 `'cool'` 而不是抛错** ——
   * 商品所在位置被删掉等异常情况下不应让整个页面崩掉。
   */
  function envOf(id: string): EnvType {
    return byId(id)?.env ?? 'cool';
  }

  /**
   * 新建位置并落到列表末尾。
   * @param input.name 会被 `trim()` 并**截断到 6 个字符**（原型对位置名的长度约束）
   * @param input.icon 缺省时取名称首字，再缺省为 '位'
   * @returns 新建的位置对象
   * @example await locations.create({ name: '酒柜', icon: '酒', env: 'dark' })
   */
  async function create(input: NewLocationInput): Promise<Location> {
    const now = Date.now();
    const row: Location = {
      id: newId(),
      name: input.name.trim().slice(0, 6),
      icon: input.icon || Array.from(input.name.trim())[0] || '位',
      env: input.env,
      sort: nextSort(list.value),
      enabled: true,
      builtin: false,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    await db.locations.put(row);
    await load();
    return row;
  }

  /** 局部更新位置字段，自动刷新 `updatedAt`。位置不存在时静默返回。 */
  async function update(id: string, patch: Partial<Location>) {
    const cur = byId(id);
    if (!cur) return;
    await db.locations.put({ ...cur, ...patch, updatedAt: Date.now() });
    await load();
  }

  async function toggle(id: string) {
    const cur = byId(id);
    if (!cur) return;
    await update(id, { enabled: !cur.enabled });
  }

  /**
   * 删除位置。**前置校验由 `domain/locationRules.canDeleteLocation` 执行**：
   * 仍有在库商品时不允许删除（只能停用），直接返回失败原因。
   *
   * @param items 商品列表（一般是 `useItemsStore().list`）。刻意由调用方传入，避免 store 之间强耦合。
   * @returns `{ ok, message }`，`message` 可直接展示给用户；失败时不执行删除。
   * @example
   * const res = await locations.remove(id, items.list);
   * if (!res.ok) toast.show(res.message); // '该位置还有 3 件在库物品，请先移出或停用'
   */
  async function remove(id: string, items: { locationId: string; status: string; deletedAt: number | null }[]): Promise<{ ok: boolean; message: string }> {
    const cur = byId(id);
    if (!cur) return { ok: false, message: '位置不存在' };
    const check = canDeleteLocation(cur, items as never);
    if (!check.ok) return check;
    await db.locations.softDelete(id);
    await load();
    return { ok: true, message: '' };
  }

  async function move(id: string, dir: -1 | 1) {
    const arr = [...all.value];
    const i = arr.findIndex((l) => l.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= arr.length) return;
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
    const now = Date.now();
    await db.locations.bulkPut(arr.map((l, idx) => ({ ...l, sort: (idx + 1) * 10, updatedAt: now })));
    await load();
  }

  function countOf(id: string, items: { locationId: string; status: string; deletedAt: number | null }[]): number {
    return countInLocation(id, items as never);
  }

  return { list, loaded, all, enabled, load, byId, envOf, create, update, toggle, remove, move, countOf };
});
