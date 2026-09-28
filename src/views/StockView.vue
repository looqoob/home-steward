<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useItemsStore } from '@/stores/items';
import { useLocationsStore } from '@/stores/locations';
import { useSettingsStore } from '@/stores/settings';
import ItemCard from '@/components/ItemCard.vue';
import LocationChipBar from '@/components/LocationChipBar.vue';
import { freshnessOf, sortByFreshness } from '@/domain/freshness';
import { monthStats, todayOverview } from '@/domain/stats';
import { todayStr } from '@/domain/dates';
import { lookupFood } from '@/data/dict';
import { normalizeName } from '@/data/dict/normalize';

const router = useRouter();
const items = useItemsStore();
const locations = useLocationsStore();
const settings = useSettingsStore();

const today = todayStr();
const keyword = ref('');
const filterLoc = ref<string | null>(null);

const overview = computed(() => todayOverview(items.active, today, settings.settings.urgentDays));
const ms = computed(() => monthStats(items.list, items.logs, Date.now()));

function matchName(name: string, kw: string): boolean {
  if (name.toLowerCase().includes(kw)) return true;
  const f = lookupFood(name);
  if (f) {
    if (normalizeName(f.key).includes(kw)) return true;
    if (f.aliases.some((a) => normalizeName(a).includes(kw))) return true;
  }
  return false;
}

const filtered = computed(() => {
  const kw = keyword.value.trim().toLowerCase();
  const list = items.active.filter((i) => {
    if (filterLoc.value && i.locationId !== filterLoc.value) return false;
    if (kw && !matchName(i.name, kw)) return false;
    return true;
  });
  return sortByFreshness(
    list.map((i) => ({
      ...i,
      sortKey: freshnessOf(i, today, settings.settings).sortKey,
    })),
  );
});

function openItem(id: string) {
  router.push(`/item/${id}`);
}
</script>

<template>
  <div>
    <div v-if="overview.dueToday > 0" class="note is-warn">
      <b>今日待吃 {{ overview.dueToday }} 件</b>，记得及时食用或处理临期食材。
    </div>

    <div class="summary">
      <div class="metric" :class="{ 'is-warn': overview.dueToday > 0 }">
        <div class="num">{{ overview.dueToday }}</div>
        <div class="lab">今日待吃</div>
      </div>
      <div class="metric" :class="{ 'is-warn': overview.overdue > 0 }">
        <div class="num">{{ overview.overdue }}</div>
        <div class="lab">已过期</div>
      </div>
      <div class="metric">
        <div class="num">{{ ms.wastedCount }}</div>
        <div class="lab">本月浪费</div>
      </div>
    </div>

    <input v-model="keyword" class="input" style="margin-bottom: 12px" placeholder="搜索食材（支持别名，如 番茄）" />

    <LocationChipBar v-model="filterLoc" @manage="router.push('/locations')" />

    <div v-if="filtered.length === 0" class="empty">
      <div class="ic">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
        </svg>
      </div>
      还没有物资，点击右下角 ＋ 快速入库
    </div>

    <ItemCard
      v-for="i in filtered"
      :key="i.id"
      :item="i"
      :location="locations.byId(i.locationId)"
      @click="openItem(i.id)"
    />
  </div>
</template>
