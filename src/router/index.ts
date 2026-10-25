import { createRouter, createWebHashHistory } from 'vue-router';

declare module 'vue-router' {
  interface RouteMeta {
    /**
     * TabLayout 外壳下需要标题栏的页面：值为标题文字。
     *
     * 顶栏由外壳（`layouts/TabLayout.vue`）渲染在滚动容器**外面**，
     * 这样它不会跟着页面滚走，也能像底部 Tab 一样占满整宽；
     * 页面自己不要再渲染 `NavBar`，否则会出现两条顶栏。
     * 独立路由（`/item/:id`、`/locations` 等）不经过 TabLayout，仍由页面自己渲染 `NavBar`。
     */
    header?: string;
  }
}

// hash 模式：PWA 离线深链与 Capacitor 的 https://localhost 场景都最稳
const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/',
      component: () => import('@/layouts/TabLayout.vue'),
      children: [
        { path: '', redirect: '/stock' },
        { path: 'stock', component: () => import('@/views/StockView.vue') },
        { path: 'list', component: () => import('@/views/ListView.vue') },
        { path: 'me', component: () => import('@/views/MeView.vue') },
        {
          path: 'consume-log',
          component: () => import('@/views/ConsumeLogView.vue'),
          meta: { header: '消耗明细' },
        },
        // v3：统计（趋势 / Top 浪费 / 周转天数 / 品类分布）
        {
          path: 'stats',
          component: () => import('@/views/StatsView.vue'),
          meta: { header: '统计' },
        },
      ],
    },
    // v1.1 F20：路由按「消费视角」拆分——
    //   /item/new     静态注册 → 编辑页（新增）。Vue Router 静态段优先于参数段，
    //                 不会被 /item/:id 抢走；ItemEditView 的 isNew 判定保留作双保险。
    //   /item/:id     物品详情页（消费视角：状态 / 快捷消耗 / 校准 / 历史）——
    //                 通知直达、卡片点击、待办等所有「看某个物品」的落点。
    //   /item/:id/edit 编辑页（表单视角）。
    // ⚠️ 历史（坑位 #13）：单一 /item/:id 时代静态 /item/new 会抢匹配导致 isNew 失效；
    //    拆分后 /item/new 静态注册是**必须**的，否则新增会落到详情页。
    { path: '/item/new', component: () => import('@/views/ItemEditView.vue') },
    { path: '/item/:id', component: () => import('@/views/ItemDetailView.vue') },
    { path: '/item/:id/edit', component: () => import('@/views/ItemEditView.vue') },
    { path: '/locations', component: () => import('@/views/LocationManageView.vue') },
    { path: '/dict', component: () => import('@/views/DictView.vue') },
    { path: '/appearance', component: () => import('@/views/AppearanceView.vue') },
    { path: '/settings', component: () => import('@/views/SettingsView.vue') },
    { path: '/backup', component: () => import('@/views/BackupView.vue') },
    // v1.1 F1：最近操作（消耗流水的逐条撤销面板）
    { path: '/recent-ops', component: () => import('@/views/RecentOpsView.vue') },
    // v1.1：更新日志（面向用户的版本说明）
    { path: '/changelog', component: () => import('@/views/ChangelogView.vue') },
    // v2：条码映射管理（扫码扫错时要能改能删，必须有出口）
    { path: '/barcodes', component: () => import('@/views/BarcodeManageView.vue') },
  ],
});

export default router;
