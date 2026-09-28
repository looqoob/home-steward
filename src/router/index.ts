import { createRouter, createWebHashHistory } from 'vue-router';

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
      ],
    },
    { path: '/item/new', component: () => import('@/views/ItemEditView.vue') },
    { path: '/item/:id', component: () => import('@/views/ItemEditView.vue') },
    { path: '/locations', component: () => import('@/views/LocationManageView.vue') },
    { path: '/dict', component: () => import('@/views/DictView.vue') },
    { path: '/settings', component: () => import('@/views/SettingsView.vue') },
    { path: '/backup', component: () => import('@/views/BackupView.vue') },
  ],
});

export default router;
