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
    // ⚠️ 不要再加静态的 '/item/new'：它会抢在 '/item/:id' 前面匹配，导致 route.params.id 为 undefined，
    // ItemEditView 的 `isNew = id === 'new'` 判定失效，新增页会显示「该物资不存在或已删除」。
    // '/item/new' 由下面的 '/item/:id' 匹配，params.id === 'new'。
    { path: '/item/:id', component: () => import('@/views/ItemEditView.vue') },
    { path: '/locations', component: () => import('@/views/LocationManageView.vue') },
    { path: '/dict', component: () => import('@/views/DictView.vue') },
    { path: '/appearance', component: () => import('@/views/AppearanceView.vue') },
    { path: '/settings', component: () => import('@/views/SettingsView.vue') },
    { path: '/backup', component: () => import('@/views/BackupView.vue') },
    // v1.1 F1：最近操作（消耗流水的逐条撤销面板）
    { path: '/recent-ops', component: () => import('@/views/RecentOpsView.vue') },
    // v2：条码映射管理（扫码扫错时要能改能删，必须有出口）
    { path: '/barcodes', component: () => import('@/views/BarcodeManageView.vue') },
  ],
});

export default router;
