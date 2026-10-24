<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import NavBar from '@/components/NavBar.vue';
import QuickAddSheet from '@/components/QuickAddSheet.vue';
import ScanSheet from '@/components/ScanSheet.vue';

const route = useRoute();
const router = useRouter();

const isStock = computed(() => route.path.startsWith('/stock'));

/**
 * 子页标题栏由**路由 meta** 驱动（`meta.header`，见 `src/router/index.ts`）。
 *
 * 为什么不让页面自己渲染 NavBar：页面渲染的顶栏在滚动容器的**内部**，
 * 会跟着内容一起滚走，还会被容器的 `px-4` 左右缩进，看起来像一张浮空的卡；
 * 由外壳渲染在滚动容器的**外面**，才能和底部 Tab 一样贴死边缘并占满整宽。
 * 页面内的吸顶元素（筛选条 / 分组头）也因此不需要再叠加顶栏高度做偏移。
 */
const headerTitle = computed(() => route.meta.header);


/**
 * 快速入库弹框的开合由路由 query 驱动（?quickadd=1），而非普通的局部状态。
 * 打开时 push 一条历史记录，手机返回键回退掉这条记录即可关闭弹框，
 * 页面不会跳转（path 始终是 /stock）。
 */
const quickAddOpen = computed(() => route.query.quickadd === '1');

/**
 * 库存页多选态下要隐藏 FAB。
 *
 * 多选时底部会出现 `BulkActionBar`（同样是 `absolute` 悬浮），两个悬浮元素叠在一起
 * 既挡内容又容易误触。用 query 参数传递选择态：多选是**跨组件**的（StockView 内部的
 * 卡片与操作条都要知道），走 provide/prop 会让 TabLayout 依赖子页面，故用 query 声明式传递。
 */
const selectMode = computed(() => route.query.select === '1');

/**
 * 盘点态（`?check=1`）与多选态互斥，同样要隐藏 FAB、让出底部空间。
 *
 * 盘点页面底部没有常驻操作条（三个判定按钮在内容流里），所以只让 FAB 的位置即可，
 * 不需要像多选那样留 132px。
 */
const stocktakeMode = computed(() => route.query.check === '1');

/** FAB 在多选 / 盘点态下都隐藏，避免两个悬浮元素打架 */
const fabHidden = computed(() => selectMode.value || stocktakeMode.value);

function openQuickAdd() {
  router.push({ path: '/stock', query: { quickadd: '1' } });
}

function closeQuickAdd() {
  // 仅当 query 仍在时才回退，避免与「自定义食材 / 新位置」的跳转互相打断
  if (route.query.quickadd) router.back();
}

/** 扫码入库（?scan=1），由快速入库弹层里的「扫码入库」按钮切过来 */
const scanOpen = computed(() => route.query.scan === '1');

function closeScan() {
  if (route.query.scan) router.back();
}


function go(path: string) {
  if (!route.path.startsWith(path)) router.push(path);
}
</script>

<template>
  <div class="flex flex-col bg-page h-full w-full max-w-[480px] mx-auto relative overflow-hidden">
    <!--
      有标题栏的页面由 NavBar 自己承担状态栏安全区（它是容器首个元素），这里不能再叠占位，
      否则白色区域会多出 12px。三个主 Tab 没有标题，才用纯白占位撑开安全区，避免顶部露灰缝。

      高度 = `--safe-top`（状态栏 / 刘海，见 composables/useSafeArea.ts）+ 12px：
      前者让白色铺满状态栏背后，后者是状态栏下方那一"点点"呼吸空间。
      ⚠️ 别写回 `env(safe-area-inset-top)`：它在 Android WebView 里恒为 0，
      主 Tab 页的标题行会整体压在状态栏下面。
    -->
    <div v-if="!headerTitle" class="flex-none bg-card h-[calc(var(--safe-top)+12px)]"></div>
    <NavBar v-else :title="headerTitle" show-back @back="router.back()" />

    <!--
      ★ v1.1 F9：这里是**纯外壳**——不滚动、无垂直 padding，只保留水平 px-4
      （页面里 -mx-4 全出血块以它为基准）。滚动由每个子页面自己管理：
      列表页是 h-full flex flex-col（头部 flex-none + 列表 flex-1 内滚），
      整页内容型（统计页）是 h-full overflow-y-auto。
      垂直留白与 FAB 让位（库存页列表 pb-[84px]）同样由页面承担，
      外壳不再知道这些细节。
    -->
    <div class="flex-1 min-h-0 overflow-hidden px-4">
      <router-view />
    </div>

    <!--
      底栏用 min-h 而不是固定 h：标签内容（22px 图标 + 3px 间距 + 12px 文字 + 上下内边距）实际约 60px，
      写死 58px 时内容会溢出容器被 overflow-hidden 裁掉一截。底部内边距再叠加安全区，避免被 Home 指示条压住。
    -->
    <div class="flex items-center min-h-[58px] bg-card border-t border-line px-2 pt-1.5 pb-[calc(6px+env(safe-area-inset-bottom,0px))] flex-none relative">
      <button
        type="button"
        class="flex-1 flex flex-col items-center gap-[3px] text-[12px] py-1"
        :class="isStock ? 'text-primary-700 font-medium' : 'text-ink-3'"
        aria-label="库存"
        @click="go('/stock')"
      >
        <svg class="icon icon-md" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
          <rect x="2.5" y="3" width="19" height="5" rx="1.2" />
          <path d="M4.5 8v10.5a2.5 2.5 0 0 0 2.5 2.5h10a2.5 2.5 0 0 0 2.5-2.5V8" />
          <path d="M10 12h4" />
        </svg>
        库存
      </button>
      <button
        type="button"
        class="flex-1 flex flex-col items-center gap-[3px] text-[12px] py-1"
        :class="route.path.startsWith('/list') ? 'text-primary-700 font-medium' : 'text-ink-3'"
        aria-label="清单"
        @click="go('/list')"
      >
        <svg class="icon icon-md" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
          <line x1="9" y1="6" x2="20" y2="6" />
          <line x1="9" y1="12" x2="20" y2="12" />
          <line x1="9" y1="18" x2="20" y2="18" />
          <circle cx="4.5" cy="6" r="1.4" />
          <circle cx="4.5" cy="12" r="1.4" />
          <circle cx="4.5" cy="18" r="1.4" />
        </svg>
        清单
      </button>
      <button
        type="button"
        class="flex-1 flex flex-col items-center gap-[3px] text-[12px] py-1"
        :class="route.path.startsWith('/me') ? 'text-primary-700 font-medium' : 'text-ink-3'"
        aria-label="我的"
        @click="go('/me')"
      >
        <svg class="icon icon-md" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
        我的
      </button>

      <button
        v-if="isStock && !fabHidden"
        type="button"
        class="absolute right-4 bottom-[calc(100%+12px)] w-[52px] h-[52px] rounded-full bg-primary-600 text-white flex items-center justify-center shadow-pop z-25 hover:bg-primary-700"
        aria-label="快速入库"
        @click="openQuickAdd"
      >
        <!-- 用 SVG + currentColor 而不是全角「＋」字形：前者一定跟随按钮配色，笔画粗细也和其它图标一致 -->
        <svg class="icon icon-lg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" aria-hidden="true">
          <line x1="12" y1="5.5" x2="12" y2="18.5" />
          <line x1="5.5" y1="12" x2="18.5" y2="12" />
        </svg>
      </button>
    </div>

    <QuickAddSheet :model-value="quickAddOpen" @update:model-value="closeQuickAdd" />
    <ScanSheet :model-value="scanOpen" @update:model-value="closeScan" />
  </div>
</template>
