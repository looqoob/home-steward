import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    vue(),
    VitePWA({
      registerType: 'autoUpdate',
      // 手动注册：原生壳里必须跳过 SW，否则 APK 内会缓存旧代码
      injectRegister: null,
      manifest: {
        name: '家庭物资管家',
        short_name: '物资管家',
        description: '家庭食材与物资的保质期、位置与购物清单管理，数据仅存本机',
        lang: 'zh-CN',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#F6F7F6',
        theme_color: '#FFFFFF',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
      },
      devOptions: { enabled: false },
    }),
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  css: {
    preprocessorOptions: { scss: { api: 'modern-compiler' } as Record<string, unknown> },
  },
  build: {
    target: 'es2020',
    // 中文文件名资源在部分 WebView 上有问题，统一用 ASCII 命名
    assetsInlineLimit: 4096,
  },
  server: { host: 'localhost', port: 5173 },
});
