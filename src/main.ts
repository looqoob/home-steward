import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { Capacitor } from '@capacitor/core';
import { registerSW } from 'virtual:pwa-register';
import App from './App.vue';
import router from './router';
import './styles/base.scss';
import './styles/components.scss';

const app = createApp(App);
app.use(createPinia());
app.use(router);
app.mount('#app');

// 原生壳里绝对不能注册 Service Worker：WebView 加载本地资源，
// SW 会缓存旧版本，导致「改了代码 APK 里还是旧的」这种极难排查的问题。
if (!Capacitor.isNativePlatform()) {
  registerSW({ immediate: true });
}
