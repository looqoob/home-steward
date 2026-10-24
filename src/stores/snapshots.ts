import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { db } from '@/data';
import type { Item, StockSnapshot } from '@/domain/types';
import { previousMonthKey, snapshotFromItems } from '@/domain/snapshot';

/**
 * 月末库存快照 store（v1.1 F4）。
 *
 * 行数极少（一月一行），整表驻内存即可；写入只发生在「次月首启」的补齐
 * （见 `domain/snapshot.ts` 顶部的时机说明），其余时间只读。
 */
export const useSnapshotsStore = defineStore('snapshots', () => {
  const list = ref<StockSnapshot[]>([]);
  const loaded = ref(false);

  async function load() {
    list.value = await db.snapshots.all();
    loaded.value = true;
  }

  /**
   * 次月首启补写上月的月末快照（幂等：已有该月就跳过）。
   *
   * 空库（全新安装 / 刚清空）不造空快照——那只是一行噪音，对比视图也用不上。
   * 跨多月未打开时只补最近一个月：更早的月份没有数据源，对比视图按「无快照」处理。
   *
   * @returns 本次写入的快照；无需写入时返回 `null`
   */
  async function ensureMonthly(items: Item[], now: number = Date.now()): Promise<StockSnapshot | null> {
    if (!items.length) return null;
    const want = previousMonthKey(now);
    if (list.value.some((s) => s.month === want && !s.deletedAt)) return null;
    const snap = snapshotFromItems(want, items, now);
    await db.snapshots.put(snap);
    await load();
    return snap;
  }

  /** 取某月的快照；没有返回 null */
  const byMonth = computed(() => (m: string) => list.value.find((s) => s.month === m && !s.deletedAt) ?? null);

  return { list, loaded, load, ensureMonthly, byMonth };
});
