<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { useItemsStore } from '@/stores/items';
import {
  categoryDistribution,
  monthStats,
  stockValue,
  topWasted,
  turnoverDays,
  wasteTrend,
} from '@/domain/stats';
import { todayStr } from '@/domain/dates';
import { useNow } from '@/composables/useNow';
import StatCard from '@/components/StatCard.vue';

/**
 * 统计页（V3-04）。
 *
 * 全部读 `items` store 的内存数据，**不额外查库**：store 的 `load()` 已经把
 * items + logs 全量读进来了，再查一次只会让页面打开时多一次全表扫描。
 */
const router = useRouter();
const items = useItemsStore();
// 响应式时刻（REV-28）：`Date.now()` / `todayStr()` 在 computed 里也不行——
// computed 只在响应式依赖变化时重算，跨零点若无数据变动，「本月」就停在昨天
const now = useNow();

const ms = computed(() => monthStats(items.list, items.logs, now.value));
const trend = computed(() => wasteTrend(items.logs, 6, now.value));
const top = computed(() => topWasted(items.logs, 5));
const turnover = computed(() => turnoverDays(items.list, items.logs));
const cats = computed(() => categoryDistribution(items.list));
/** 在库总价值（**含已过期**，过期部分单独给出） */
const value = computed(() => stockValue(items.list, todayStr(now.value)));

/**
 * 在库价值的脚注。
 *
 * 这里的措辞比数字本身更重要：「在库 ¥86」看着像覆盖了全部库存，
 * 但没填单价的东西根本没算进去 —— 不写清楚，用户会拿这个数去对账，然后发现对不上。
 */
const valueHint = computed(() => {
  const v = value.value;
  const parts: string[] = [];
  if (v.overAmount > 0) parts.push(`含已过期 ¥${v.overAmount.toFixed(0)}`);
  if (v.unpriced > 0) parts.push(`${v.unpriced} 件没填单价，未计入`);
  return parts.join(' · ');
});

/**
 * 柱状条的统一标尺。
 *
 * ⚠️ 必须是**全局**最大值而不是各自的最大值：各自归一化会让「3 月扔了 30 元」
 * 和「5 月扔了 5 元」画出等高的柱子，趋势图就变成了两张互不相干的柱状图。
 */
const trendMax = computed(() => Math.max(1, ...trend.value.map((t) => t.amount)));

/** 「数据不足」的统一口径：宁可空着，也不要拿 2 笔数据编一个结论 */
const INSUFFICIENT = '数据不足';

/**
 * 「扔掉 8 件 / ¥0」是最容易被误读的一组数字 —— 用户会以为自己没浪费钱，
 * 实际上是**这些物品都没填单价**。金额栏本身只有 4 个字符宽，说不下原因，
 * 所以补一行脚注把它讲清楚（比把 ¥0 画成红色更有用）。
 */
const wastedNoPriceHint = computed(() => {
  const { wastedCount, wastedAmount } = ms.value;
  if (wastedCount === 0 || wastedAmount > 0) return '';
  return `这 ${wastedCount} 件都没填单价，金额按 0 计`;
});

/** Top 里只要有一条是 0 金额（显示「—」），就要说明「—」是什么意思 */
const topHasNoPrice = computed(() => top.value.some((t) => t.amount === 0));
</script>

<template>
  <div>
    <!-- 本月概览：与「我的」页同一套数字来源（monthStats），口径不会打架 -->
    <div class="section-label">本月概览</div>
    <div class="grid grid-cols-4 gap-2 mb-5">
      <StatCard :value="ms.inbound" label="入库" />
      <StatCard :value="ms.consumed" label="用掉" />
      <StatCard :value="ms.wastedCount" label="扔掉" />
      <StatCard
        :value="`¥${ms.wastedAmount.toFixed(0)}`"
        label="浪费金额"
        :tone="ms.wastedAmount > 0 ? 'danger' : 'neutral'"
      />
    </div>
    <div v-if="wastedNoPriceHint" class="text-[11px] text-ink-3 -mt-3 mb-5 leading-relaxed">
      {{ wastedNoPriceHint }}。入库时填了单价才会统计到金额。
    </div>

    <!--
      在库物资总价值。
      口径：**过期计入**（还没扔，钱已经花了，它就是还在），但过期金额单独标注，
      否则「在库 ¥86」会让人高估还能用的部分。
    -->
    <div class="section-label">在库物资</div>
    <div class="card p-3.5 mb-5">
      <div class="flex items-baseline gap-1.5">
        <span class="text-[22px] font-semibold leading-[1.2] tabular-nums">¥{{ value.total.toFixed(2) }}</span>
        <span class="text-[12px] text-ink-3">共 {{ value.priced }} 件有价</span>
      </div>
      <div v-if="valueHint" class="text-[11px] text-ink-3 mt-1 leading-relaxed">{{ valueHint }}</div>
      <div v-else class="text-[11px] text-ink-3 mt-1 leading-relaxed">已覆盖全部在库物品</div>
    </div>

    <!--
      趋势用纯 CSS 柱状条，不引图表库。
      理由很实际：这是 6 根柱子，chart.js 压缩后也有 200KB+，而整个应用现在才 ~880KB（预缓存），
      为了画 6 根条把首屏体积翻倍不划算。柱高用内联 style 而非 SVG，是为了能直接用状态色 token。
    -->
    <div class="section-label">近 6 个月浪费</div>
    <div class="card p-3.5 mb-5">
      <template v-if="trend.length">
        <div class="flex items-end gap-2 h-28 mb-2">
          <div
            v-for="t in trend"
            :key="t.month"
            class="flex-1 flex flex-col items-center justify-end gap-1 min-w-0"
          >
            <span class="text-[11px] text-ink-3 tabular-nums">{{ t.amount > 0 ? t.amount.toFixed(0) : '' }}</span>
            <div
              class="w-full rounded-t"
              :style="{
                height: Math.max(2, (t.amount / trendMax) * 76) + 'px',
                // ⚠️ 走 CSS 变量而不是 `bg-over-bar` 这类工具类：
                // `--state-*-bar` 没注册进 Tailwind 的 `@theme`，只有 bg/fg 注册了。
                // 写成工具类不会报错，只是**静默失效**，柱子会变成透明。
                background: t.amount > 0 ? 'var(--state-over-bar)' : 'var(--bg-sunken)',
              }"
              :title="`${t.month}：${t.count} 件 / ¥${t.amount.toFixed(2)}`"
            ></div>
          </div>
        </div>
        <div class="flex gap-2 border-t border-line pt-2">
          <span v-for="t in trend" :key="t.month" class="flex-1 text-center text-[11px] text-ink-3 min-w-0">{{ t.label }}</span>
        </div>
      </template>
      <div v-else class="text-center py-6 text-[13px] text-ink-3">{{ INSUFFICIENT }}</div>
    </div>

    <!--
      Top 5 可点进明细页看该名称的历史。
      `?name=` 是消耗明细页已支持的筛选参数（见 ConsumeLogView），不新增跳转协议。
    -->
    <div class="section-label">最常浪费</div>
    <div class="card p-3.5 mb-5">
      <template v-if="top.length">
        <button
          v-for="(t, i) in top"
          :key="t.name"
          type="button"
          class="flex items-center gap-2.5 w-full text-left py-1.5 min-h-11"
          :aria-label="`查看 ${t.name} 的消耗明细`"
          @click="router.push({ path: '/consume-log', query: { name: t.name } })"
        >
          <span class="w-4 text-[12px] text-ink-3 flex-none">{{ i + 1 }}</span>
          <span class="flex-1 min-w-0 text-[13px] text-ink-1 truncate">{{ t.name }}</span>
          <span class="text-[12px] text-ink-3 flex-none tabular-nums">{{ t.count }} 件</span>
          <span class="text-[12px] text-danger flex-none tabular-nums w-14 text-right">
            {{ t.amount > 0 ? '¥' + t.amount.toFixed(0) : '—' }}
          </span>
          <span class="text-ink-3 flex-none" aria-hidden="true">›</span>
        </button>
      </template>
      <div v-else class="text-center py-6 text-[13px] text-ink-3">还没有浪费记录</div>
      <div v-if="topHasNoPrice" class="text-[11px] text-ink-3 mt-1.5 leading-relaxed">
        「—」= 这些记录没填单价，不是没花钱。
      </div>
    </div>

    <div class="grid grid-cols-1 gap-4 mb-5">
      <div class="card p-3.5">
        <div class="text-[12px] text-ink-3 mb-1.5">平均周转天数</div>
        <template v-if="turnover !== null">
          <div class="text-[22px] font-semibold leading-[1.2]">{{ turnover }} <span class="text-[13px] text-ink-3 font-normal">天</span></div>
          <div class="text-[11px] text-ink-3 mt-1">入库到吃完的平均间隔</div>
        </template>
        <div v-else class="text-[13px] text-ink-3 py-1">{{ INSUFFICIENT }}（至少 5 件吃完才计算）</div>
      </div>

      <div class="card p-3.5">
        <div class="text-[12px] text-ink-3 mb-2">在库品类分布</div>
        <template v-if="cats.length">
          <div v-for="c in cats" :key="c.category" class="flex items-center gap-2.5 mb-2 text-[12px]">
            <span class="w-14 flex-none text-ink-2 truncate">{{ c.label }}</span>
            <span class="flex-1 h-2 bg-sunken rounded overflow-hidden">
              <i class="block h-full rounded bg-primary-500" :style="{ width: (c.percent * 100).toFixed(0) + '%' }"></i>
            </span>
            <span class="w-6 text-right text-ink-2 flex-none tabular-nums">{{ c.count }}</span>
          </div>
        </template>
        <div v-else class="text-[13px] text-ink-3 py-1">暂无在库物品</div>
      </div>
    </div>

    <div class="tip">
      统计只覆盖本机记录。样本不足时会直接写「数据不足」而不是画一条看起来很确定的曲线。
    </div>
  </div>
</template>
