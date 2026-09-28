import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.home.steward',
  appName: '家庭物资管家',
  webDir: 'dist',
  // 不配置 server.url：保证 APK 完全离线可用，不依赖任何远程服务器。
  // 原生壳里 main.ts 也会跳过 Service Worker 注册，避免缓存旧代码。
};

export default config;
