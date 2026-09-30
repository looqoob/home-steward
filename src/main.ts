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
  registerSW({ immediate: true });
}
