import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { db } from '@/data';
import type { DictEntry, EnvType, ShelfLifeValue } from '@/domain/types';
import { newId } from '@/domain/ids';
import { buildCustomMap, createResolver } from '@/data/dict';
import { normalizeName } from '@/data/dict/normalize';
import { useItemsStore } from './items';

export const useDictStore = defineStore('dict', () => {
  const entries = ref<DictEntry[]>([]);
  const loaded = ref(false);

  const map = computed(() => buildCustomMap(entries.value));
  const resolve = computed(() => createResolver(map.value));

  async function load() {
    entries.value = await db.dict.all();
    loaded.value = true;
  }

  /**
   * 新增或覆盖一条自定义保质期规则。
   *
   * - `dictKey` 会被 `normalizeName` 归一化，所以传「西红柿（大）」与「西红柿」等价。
   * - 已存在同 `dictKey|env` 时保留原 id，只更新 `days` / `reason` / `displayName` 与 `updatedAt`。
   * - `days` 允许传 `NOT_RECOMMENDED (-1)`，表示明确不建议放在该环境。
   *
   * ⚠️ 保存后会**自动**用新字典重算所有在库商品的到期日（`items.recomputeAll`）。
   * 此前这步要调用方「记得调用」，字典页从来没调——用户改了保质期，已有商品
   * 仍按旧日期提醒，按错误日期吃/扔（REV-10）。历史日志与已消耗的成品不受影响。
   * @example await dict.upsert('榴莲', '榴莲', 'chilled', 5, null)
   */
  async function upsert(dictKey: string, displayName: string, env: EnvType, days: ShelfLifeValue, reason: string | null) {
    const key = normalizeName(dictKey);
    const now = Date.now();
    const existing = map.value.get(`${key}|${env}`);
    const row: DictEntry = existing
      ? { ...existing, days, reason, displayName, updatedAt: now }
      : {
          id: newId(),
          dictKey: key,
          displayName: displayName || dictKey,
          env,
          days,
          reason,
          origin: 'custom',
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
        };
    await db.dict.put(row);
    await load();
    await useItemsStore().recomputeAll();
  }

  /**
   * 删除某条自定义规则（软删除），之后该 `名称|环境` 组合会回落到内置字典 / 品类 / 全局兜底。
   * 与 `upsert` 对称，删除后同样**自动**重算在库商品的到期日（REV-10）。
   * 找不到对应条目时静默返回。
   * @example await dict.reset('榴莲', 'chilled')
   */
  async function reset(dictKey: string, env: EnvType) {
    const key = normalizeName(dictKey);
    const existing = map.value.get(`${key}|${env}`);
    if (!existing) return;
    await db.dict.softDelete(existing.id);
    await load();
    await useItemsStore().recomputeAll();
  }

  function isCustom(dictKey: string, env: EnvType): boolean {
    return map.value.has(`${normalizeName(dictKey)}|${env}`);
  }

  return { entries, loaded, map, resolve, load, upsert, reset, isCustom, normalize: normalizeName };
});
