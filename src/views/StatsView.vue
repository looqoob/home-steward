<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { useItemsStore } from '@/stores/items';
import { useSnapshotsStore } from '@/stores/snapshots';
import { previousMonthKey, diffMonth, isCurrentMonthLog } from '@/domain/snapshot';
import { foodKeyOf } from '@/data/dict';
import { fmtMoney } from '@/domain/price';
import {
  categoryDistribution,
  monthStats,
  stockValue,
  topWasted,
  turnoverDays,
  wasteTrend,
} from '@/domain/stats';
import { todayStr } from '@/domain/dates';
import { buildStatsCsv } from '@/domain/statsCsv';
import { downloadText, copyToClipboard } from '@/data/backup/export';
import { useNow } from '@/composables/useNow';
import { useToast } from '@/composables/useToast';
import TabPageBody from '@/components/TabPageBody.vue';

/**
 * 统计页（V3-04）。
 *
 * 全部读 `items` store 的内存数据，**不额外查库**：store 的 `load()` 已经把
 * items + logs 全量读进来了，再查一次只会让页面打开时多一次全表扫描。
 */
const router = useRouter();
const items = useItemsStore();
const { show } = useToast();
// 响应式时刻（REV-28）：`Date.now()` / `todayStr()` 在 computed 里也不行——
// computed 只在响应式依赖变化时重算，跨零点若无数据变动，「本月」就停在昨天
const now = useNow();

// 本月概览数字：不再画卡（v1.1 F15-5，与「我的」页去重），仍作为 CSV 导出的数据源
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
  if (v.overAmount > 0) parts.push(`含已过期 ¥${v.overAmount.toFixed(0)}`); // audit-ignore: money-format（脚注整数紧凑显示，两位小数反而拖长）
  if (v.unpriced > 0) parts.push(`${v.unpriced} 件没填单价，未计入`);
  return parts.join(' · ');
});

/* ==================== 本月 vs 上月末（v1.1 F4） ==================== */

const snapshots = useSnapshotsStore();

/** 上月的月末快照；跨多月未打开 / 首月使用时为 null */
const prevSnap = computed(() => snapshots.byMonth(previousMonthKey(now.value)));

/** 差集：新购 / 减少。键口径与库存折叠同一把（含别名 / 位置 / 单位） */
const monthDiff = computed(() => {
  const snap = prevSnap.value;
  if (!snap) return null;
  const logs = items.logs.filter((l) => isCurrentMonthLog(l, now.value));
  return diffMonth(snap, items.active, logs, foodKeyOf);
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

/** Top 里只要有一条是 0 金额（显示「—」），就要说明「—」是什么意思 */
const topHasNoPrice = computed(() => top.value.some((t) => t.amount === 0));

/* ==================== 导出 CSV（v1.1 F2） ==================== */

/**
 * 导出统计 CSV。文本拼装走纯函数 `domain/statsCsv`（可单测），
 * 下载通道与备份共用 `downloadText`；WebView 不支持下载时降级「复制到剪贴板」，
 * 两者都失败才报错 —— 与 BackupView 的降级链路同一套约定。
 */
async function exportCsv() {
  const csv = buildStatsCsv({
    monthLabel: todayStr(now.value).slice(0, 7),
    overview: ms.value,
    trend: trend.value,
    top: top.value,
    categories: cats.value,
    value: value.value,
  });
  if (downloadText(`home-steward-stats-${todayStr(now.value)}.csv`, csv, 'text/csv;charset=utf-8')) {
    show('已导出 CSV');
    return;
  }
  const copied = await copyToClipboard(csv);
  show(copied ? '当前环境不支持下载，CSV 已复制到剪贴板' : '导出失败，请重试', copied ? 3000 : 2200);
}
</script>

<template>
  <!-- v1.1 F14：整页滚动的骨架由 TabPageBody 固化（page 模式） -->
  <TabPageBody mode="page" scroll-class="pb-3">
    <!--
      v1.1 F15-5：去掉「本月概览」三卡——它与「我的」页的月度卡片同源同形同数字，
      两个页面用同一组数字开头会稀释统计页「更深一层」的定位（趋势/对比/Top）。
      概览数字只在「我的」页出现；本页从在库价值直接开始。
    -->

    <!--
      在库物资总价值。
      口径：**过期计入**（还没扔，钱已经花了，它就是还在），但过期金额单独标注，
      否则「在库 ¥86」会让人高估还能用的部分。
    -->
    <div class="section-label">在库物资</div>
    <div class="card p-3.5 mb-5">
      <div class="flex items-baseline gap-1.5">
        <span class="text-[22px] font-semibold leading-[1.2] tabular-nums">{{ fmtMoney(value.total) }}</span>
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
    <!-- v1.1 F4：上月末快照 vs 当前在库 —— 「这个月到底新买了什么 / 消失了什么」 -->
    <div class="section-label">本月 vs 上月末</div>
    <div class="card p-3.5 mb-5">
      <template v-if="monthDiff">
        <div class="text-[13px] font-medium text-ink-1 mb-2.5">本月新购</div>
        <template v-if="monthDiff.added.length">
          <div v-for="(r, idx) in monthDiff.added" :key="'a' + idx" class="flex items-center gap-2 mb-1.5 text-[12px]">
            <!-- audit-ignore: env-dot（图表图例：无名称文字的点，EnvDotLabel 是点+名结构不适用） -->
            <span class="w-1.5 h-1.5 rounded-full bg-primary-500 flex-none"></span>
            <span class="flex-1 min-w-0 truncate text-ink-1">{{ r.name }}</span>
            <span class="text-ink-3 tabular-nums flex-none">+{{ r.qty }} {{ r.unit }}</span>
          </div>
        </template>
        <div v-else class="text-[12px] text-ink-3 mb-3">本月没有新购物资</div>

        <div class="text-[13px] font-medium text-ink-1 mt-3 mb-2.5">本月减少</div>
        <template v-if="monthDiff.removed.length">
          <div v-for="(r, idx) in monthDiff.removed" :key="'r' + idx" class="flex items-center gap-2 mb-1.5 text-[12px]">
            <!-- audit-ignore: env-dot（图表图例：无名称文字的点，EnvDotLabel 是点+名结构不适用） -->
            <!-- 状态色未注册进 @theme，只能 var() 引用（坑位 #36） -->
            <span class="w-1.5 h-1.5 rounded-full flex-none" style="background: var(--state-over-bar);"></span>
            <span class="flex-1 min-w-0 truncate text-ink-1">{{ r.name }}</span>
            <span class="text-ink-3 flex-none">{{ r.note }}</span>
            <span class="text-ink-3 tabular-nums flex-none">-{{ r.qty }} {{ r.unit }}</span>
          </div>
        </template>
        <div v-else class="text-[12px] text-ink-3">本月没有减少的物资</div>
      </template>
      <div v-else class="text-[12px] text-ink-3 leading-relaxed">
        上月末的库存快照还没生成：快照在每月首次打开时自动补写上月的月末状态，用满一个自然月后这里就有对比了。
      </div>
    </div>

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
              :title="`${t.month}：${t.count} 件 / ${fmtMoney(t.amount)}`"
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
            {{ t.amount > 0 ? `¥${t.amount.toFixed(0)}` : "—" }}<!-- audit-ignore: money-format（图表标注整数） -->
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

    <!-- v1.1 F2：导出 CSV——纯本地无账号下，文件是分享给家人的唯一途径 -->
    <van-button block type="primary" class="mt-1" @click="exportCsv">导出 CSV</van-button>
    <div class="text-[11px] text-ink-3 mt-2 leading-relaxed">
      导出本月概览 / 浪费趋势 / Top 浪费 / 品类分布 / 在库价值。下载不可用时自动改为复制到剪贴板。
    </div>
  </TabPageBody>
</template>
