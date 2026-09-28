import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { db } from '@/data';
import type { ConsumeLog, ConsumeType, Item } from '@/domain/types';
import { newId } from '@/domain/ids';
import { todayStr } from '@/domain/dates';
import { createItem, recomputeForLocation, type NewItemInput } from '@/domain/itemFactory';
import { fallbackDays } from '@/domain/categories';
import { lookupFood } from '@/data/dict';
import { useDictStore } from './dict';
import { useLocationsStore } from './locations';

export const useItemsStore = defineStore('items', () => {
  const list = ref<Item[]>([]);
  const logs = ref<ConsumeLog[]>([]);
  const loaded = ref(false);

  const active = computed(() => list.value.filter((i) => !i.deletedAt && i.status === 'in_stock'));

  /** 全量重读商品与日志到本地状态（写操作内部都会调用） */
  async function load() {
    const [items, ls] = await Promise.all([db.items.all(), db.logs.all()]);
    list.value = items;
    logs.value = ls;
    loaded.value = true;
  }

  /** 同步按 id 查找商品（已过滤软删除）；找不到返回 undefined */
  function byId(id: string): Item | undefined {
    return list.value.find((i) => i.id === id && !i.deletedAt);
  }

  /**
   * 新建商品并落库。到期日由 `domain/itemFactory.createItem` 推算：
   * 品类从内置字典取，环境由 `locationId` 查得，随后走四级兜底。
   *
   * @param input 用户输入（名称 / 数量 / 单位 / 位置，其余可选）
   * @returns 落库后的完整 Item（含自动生成的 id 与 expireAt）
   * @example await items.add({ name: '牛奶', quantity: 2, unit: '盒', locationId: fridgeId })
   */
  async function add(input: NewItemInput): Promise<Item> {
    const dict = useDictStore();
    const locs = useLocationsStore();
    const category = lookupFood(input.name)?.category ?? null;
    const item = createItem(input, locs.envOf(input.locationId), dict.resolve, fallbackDays, Date.now(), category);
    await db.items.put(item);
    await load();
    return item;
  }

  /**
   * 整条覆盖写入商品，并刷新 `updatedAt`。
   * ⚠️ 是 put 而非 patch：传入的对象缺失的字段会被写成上一次的值（调用方通常传展开后的完整 Item）。
   */
  async function save(item: Item) {
    await db.items.put({ ...item, updatedAt: Date.now() });
    await load();
  }

  /**
   * 切换位置后重算到期日，**入库日期 `storedAt` 保持不变**。
   * 商品不存在时静默返回（不抛错）。
   * @example await items.moveTo(id, pantryId)
   */
  async function moveTo(id: string, locationId: string) {
    const dict = useDictStore();
    const locs = useLocationsStore();
    const cur = byId(id);
    if (!cur) return;
    const patch = recomputeForLocation(cur, locs.envOf(locationId), dict.resolve, fallbackDays);
    await db.items.put({ ...cur, ...patch, locationId, updatedAt: Date.now() });
    await load();
  }

  /**
   * 设置或清除手填保质期并重算到期日。手填天数优先级最高，后续切位置也不会被字典覆盖。
   * @param days 天数；传 `null` 或 ≤ 0 表示关闭手填，回落自动推算。
   * @example await items.setManualShelfLife(id, 30)
   */
  async function setManualShelfLife(id: string, days: number | null) {
    const dict = useDictStore();
    const locs = useLocationsStore();
    const cur = byId(id);
    if (!cur) return;
    const next = { ...cur, manualShelfLife: days && days > 0 ? days : null };
    const patch = recomputeForLocation(next, locs.envOf(cur.locationId), dict.resolve, fallbackDays);
    await db.items.put({ ...next, ...patch, updatedAt: Date.now() });
    await load();
  }

  /**
   * 消耗一件商品：写一条日志，并把商品状态改为 `'finished'`。
   *
   * @param type `'consumed'` 用掉了 / `'wasted'` 扔掉了。后者会计入「本月浪费金额」。
   * @remarks 方法本身不校验重复调用；UI 层对已 finished 的商品隐藏了入口。
   * @example await items.consume(id, 'wasted')
   */
  async function consume(id: string, type: ConsumeType) {
    const cur = byId(id);
    if (!cur) return;
    const now = Date.now();
    const today = todayStr(now);
    let overdueDays: number | null = null;
    if (cur.expireAt) {
      const d = Math.round((new Date(`${cur.expireAt}T00:00:00`).getTime() - new Date(`${today}T00:00:00`).getTime()) / 86400000);
      overdueDays = d < 0 ? -d : 0;
    }
    const log: ConsumeLog = {
      id: newId(),
      itemId: cur.id,
      name: cur.name,
      quantity: cur.quantity,
      unit: cur.unit,
      locationId: cur.locationId,
      type,
      price: cur.price,
      expireAt: cur.expireAt,
      overdueDays,
      at: now,
      createdAt: now,
      deletedAt: null,
    };
    await db.logs.put(log);
    await db.items.put({ ...cur, status: 'finished', updatedAt: now });
    await load();
  }

  /**
   * 软删除商品（不写消耗日志）。用于「手滑加错了」的场景，
   * 与 `consume` 的区别是不影响统计。
   * @example await items.remove(id)
   */
  async function remove(id: string) {
    await db.items.softDelete(id);
    await load();
  }

  /**
   * 用当前字典**重算所有在库商品**的到期日并批量落库。
   * 用户在字典页改了保质期后必须调用，否则已有商品仍是旧的天数快照。
   * 历史日志与已消耗的成品不会被改写。
   * @example await items.recomputeAll()
   */
  async function recomputeAll() {
    const dict = useDictStore();
    const locs = useLocationsStore();
    const now = Date.now();
    const updated = active.value.map((i) => ({
      ...i,
      ...recomputeForLocation(i, locs.envOf(i.locationId), dict.resolve, fallbackDays),
      updatedAt: now,
    }));
    if (updated.length) await db.items.bulkPut(updated);
    await load();
  }

  return { list, logs, loaded, active, load, byId, add, save, moveTo, setManualShelfLife, consume, remove, recomputeAll };
});
