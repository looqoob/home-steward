import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { Capacitor } from '@capacitor/core';
import { registerSW } from 'virtual:pwa-register';
// ⚠️ 必须先于 App.vue 导入：index.css 首行的 @layer 声明要赶在 Vant 的样式之前执行，
// 否则 Vant 的 @layer vant{} 块会先注册 vant 层，把它排到 base 之前，
// Tailwind 的 preflight 就会反过来压过 .van-button 的样式（按钮圆角/底色全部丢失）。
import './styles/index.css';
import App from './App.vue';
import router from './router';

const app = createApp(App);
app.use(createPinia());
app.use(router);
app.mount('#app');

// 原生壳里绝对不能注册 Service Worker：WebView 加载本地资源，
// SW 会缓存旧版本，导致「改了代码 APK 里还是旧的」这种极难排查的问题。
if (!Capacitor.isNativePlatform()) {
  registerSW({
    immediate: true,
    // 页面可能长时间挂在后台（PWA 常见），期间不会自己去找更新，所以定时轮询一次。
    onRegistered(reg) {
      if (!reg) return;
      setInterval(() => {
        // 只在页面可见时检查，避免后台标签空跑
        if (document.visibilityState === 'visible') void reg.update();
      }, 30 * 60 * 1000);
    },
  });

  /**
   * 新 SW 安装并拿到控制权后自动刷新页面。
   *
   * 背景：workbox 虽然配了 skipWaiting + clientsClaim，但这两件事只保证**新 SW 会接管**，
   * 不会让**已经渲染出来的旧页面**自动重绘。结果是「服务器已经是新版、用户眼前的界面还是旧的」，
   * 必须手动刷新一次 —— 这正是每次发布后最常见的「线上没更新」误会来源。
   * 监听 controllerchange 补上一次 reload，发布后用户下次打开就是新版。
   *
   * reload() 会销毁当前 JS 上下文，下面的守卫在一次页面生命周期内只会放行一次，
   * 避免极端情况下（SW 反复接管）出现刷新死循环。
   */
  let reloaded = false;
  navigator.serviceWorker?.addEventListener('controllerchange', () => {
    if (reloaded) return;
    reloaded = true;
    window.location.reload();
  });
}
