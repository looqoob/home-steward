<script setup lang="ts">
/**
 * 更新日志：面向最终用户的版本更新说明。
 *
 * 文案要求：**说人话、说收益**——不写 REV 编号、commit、模块名；用户只关心
 * 「多了什么、顺手了什么」。每个版本一个条目：版本号 + 日期 + 变更点列表。
 *
 * ⚠️ 只列**对用户重要的关键点**（v1.2 定案）：一个版本 3~6 条、每条一句话，
 * 内部重构 / 修复 / 看不见的打磨不进列表；不要把所有改动都罗列出来。
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
    version: 'v1.2',
    date: '2026-10-25',
    items: [
      '三个主页面头部固定、只有列表滚动，长列表怎么翻都不卡。',
      '吃完了东西马上出现在清单里；新增「复制」一键把清单发给家人。',
      '过期物品一键「扔掉」默认全部；多件到期合并成一条通知，不再轰炸。',
      '新鲜的物资退为灰色，需要处理的自动突出来；过期徽标红底白字。',
      '首次打开有 3 步小引导；我的页入口分成「查看 / 管理」两组。',
      '数字等宽对齐、按钮点击区加大到 44px、深色模式对比全面达标。',
    ],
  },
  {
    version: 'v1.1',
    date: '2026-10-24',
    items: [
      '新增「最近操作」页：最近的用掉 / 扔掉记录可随时撤销。',
      '点击临期提醒通知，直接打开对应物品（安卓 App）。',
      '统计页新增「导出 CSV」与「本月 vs 上月末」对账。',
      '入库时可以给食材挑一个 emoji 图标。',
      '「今日待办」默认收起；新增本更新日志页。',
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
