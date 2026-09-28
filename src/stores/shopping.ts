import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { db } from '@/data';
import type { ShoppingItem } from '@/domain/types';
import { newId } from '@/domain/ids';
import { planShopping, type Suggestion } from '@/domain/shoppingRules';
import { useItemsStore } from './items';
import { useSettingsStore } from './settings';

const DISMISS_MS = 7 * 24 * 60 * 60 * 1000;

export const useShoppingStore = defineStore('shopping', () => {
  const list = ref<ShoppingItem[]>([]);
  const loaded = ref(false);

  const visible = computed(() => list.value.filter((s) => !s.deletedAt));
  const pending = computed(() => visible.value.filter((s) => !s.checked));
  const done = computed(() => visible.value.filter((s) => s.checked));

  async function load() {
    list.value = await db.shopping.all();
    loaded.value = true;
  }

  /**
   * 根据商品与消耗日志自动生成购物建议并落库。
   *
   * **幂等**：同一 `name|reason` 不会重复生成，且被删除的自动项在 7 天内不会重生
   *（`domain/shoppingRules.planShopping` 保证），所以可以安全地每次启动都调用。
   *
   * @returns 本次新增条数；`0` 表示没有新建议。
   * @remarks 依赖 `items`、`settings` store 已加载，否则结果为空。
   * @example const n = await shopping.generate();
   */
  async function generate(): Promise<number> {
    const items = useItemsStore();
    const settings = useSettingsStore();
    const suggestions: Suggestion[] = planShopping(items.list, items.logs, list.value, Date.now(), settings.settings);
    if (!suggestions.length) return 0;
    const now = Date.now();
    const rows: ShoppingItem[] = suggestions.map((s) => ({
      id: newId(),
      name: s.name,
      quantity: null,
      unit: s.unit,
      locationId: s.locationId,
      reason: s.reason,
      sourceItemId: s.sourceItemId,
      checked: false,
      checkedAt: null,
      auto: true,
      dismissedUntil: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    }));
    await db.shopping.bulkPut(rows);
    await load();
    return rows.length;
  }

  async function toggle(id: string) {
    const cur = list.value.find((s) => s.id === id);
    if (!cur) return;
    await db.shopping.put({ ...cur, checked: !cur.checked, checkedAt: cur.checked ? null : Date.now(), updatedAt: Date.now() });
    await load();
  }

  /** 手动添加一条清单项。`name` trim 后为空则静默返回（不报提示）。 */
  async function addManual(name: string) {
    const now = Date.now();
    const n = name.trim();
    if (!n) return;
    await db.shopping.put({
      id: newId(),
      name: n,
      quantity: null,
      unit: null,
      locationId: null,
      reason: 'manual',
      sourceItemId: null,
      checked: false,
      checkedAt: null,
      auto: false,
      dismissedUntil: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });
    await load();
  }

  /**
   * 删除一条清单项，行为按来源分岔：
   * - **自动项**（`auto: true`）：软删除并设置 `dismissedUntil = now + 7 天`，7 天内不会被重新生成；
   * - **手动项**（`auto: false`）：直接软删除。
   *
   * ⚠️ 「删除自动建议」不等于永久忽略：7 天后若规则仍命中会再次出现。这是设计意图。
   */
  async function remove(id: string) {
    const cur = list.value.find((s) => s.id === id);
    if (!cur) return;
    if (cur.auto) {
      await db.shopping.put({ ...cur, deletedAt: Date.now(), dismissedUntil: Date.now() + DISMISS_MS, updatedAt: Date.now() });
    } else {
      await db.shopping.softDelete(id);
    }
    await load();
  }

  /** 清除所有已勾选项（软删除 + `dismissedUntil`，同自动项的删除策略）。未勾选项不受影响。 */
  async function clearDone() {
    const now = Date.now();
    for (const s of done.value) {
      await db.shopping.put({ ...s, deletedAt: now, dismissedUntil: now + DISMISS_MS, updatedAt: now });
    }
    await load();
  }

  return { list, loaded, visible, pending, done, load, generate, toggle, addManual, remove, clearDone };
});
