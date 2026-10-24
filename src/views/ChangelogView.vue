<script setup lang="ts">
/**
 * 更新日志（v1.1）：面向最终用户的版本更新说明。
 *
 * 文案要求：**说人话、说收益**——不写 REV 编号、commit、模块名；用户只关心
 * 「多了什么、顺手了什么」。每个版本一个条目：版本号 + 日期 + 变更点列表。
 *
 * ⚠️ 发版约定：每次发版**必须**在本文件的 ENTRIES 顶部追加一个条目（与
 * docs/BATCHES.md 台账登记同步——台账给开发者看，这里给用户看）。
 */
import PageShell from '@/components/PageShell.vue';

interface ChangelogEntry {
  version: string;
  date: string;
  items: string[];
}

const ENTRIES: ChangelogEntry[] = [
  {
    version: 'v1.1',
    date: '2026-10-24',
    items: [
      '撤销更从容：新增「最近操作」页（我的 → 最近操作），最近 30 条「用掉 / 扔掉」的记录随时可撤销，不用再抢提示消失前的几秒钟。',
      '通知一点就到：点击临期提醒通知，直接打开对应物品的详情页（安卓 App）。',
      '统计能分享了：统计页新增「导出 CSV」，一键把本月的消费、浪费、库存价值存成文件，发给家人对账。',
      '图标随心选：入库时可以给食材挑一个 emoji 图标（比如鸡蛋选 🥚），不选就用名字首字；常选的会排在最前面。',
      '月度对账：统计页新增「本月 vs 上月末」，这个月新买了什么、吃掉 / 扔掉了什么，一眼看完。',
      '「今日待办」默认收起，页面更清爽；数字仍在顶部概览卡里，需要处理时点开即可。',
      '新增这个「更新日志」页，以后每次更新在这里说清楚改了什么。',
    ],
  },
  {
    version: 'v1.0.0',
    date: '2026-10-23',
    items: [
      '第一个正式版：库存、保质期提醒、购物清单、消耗明细、统计一应俱全。',
      '数据 100% 存在你自己的手机上——没有账号、没有服务器，换机用「备份导出 / 导入」搬家。',
      '可添加到主屏幕当 App 用，也提供安卓安装包。',
    ],
  },
];
</script>

<template>
  <PageShell title="更新日志">
    <div v-for="e in ENTRIES" :key="e.version" class="card card-lg p-4 mb-3 shadow-card">
      <div class="flex items-baseline justify-between gap-2 mb-2.5">
        <span class="text-[16px] font-semibold text-ink-1">{{ e.version }}</span>
        <span class="text-[12px] text-ink-3">{{ e.date }}</span>
      </div>
      <ul class="flex flex-col gap-2">
        <li v-for="(it, i) in e.items" :key="i" class="flex gap-2 text-[13px] text-ink-2 leading-relaxed">
          <span class="text-primary-600 flex-none">•</span>
          <span>{{ it }}</span>
        </li>
      </ul>
    </div>

    <div class="tip">
      本应用完全离线运行，更新即替换安装；你的数据不受更新影响。
    </div>
  </PageShell>
</template>
