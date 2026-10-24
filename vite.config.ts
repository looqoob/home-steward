import { fileURLToPath, URL } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';
import Components from 'unplugin-vue-components/vite';
import { VantResolver } from 'unplugin-vue-components/resolvers';
import { VitePWA } from 'vite-plugin-pwa';

/**
 * 把 Vant 自带样式整体放进低优先级的 `@layer vant`。
 *
 * 为什么必须这么做：Vant 的 `style/base.css` 里有几条**全局元素选择器**（`input,button,textarea{color:inherit;font:inherit}`、
 * `body{font-family:...}`、`*:focus{outline:none}`）。这些规则是 **unlayered** 的，而 Tailwind v4 的工具类在
 * `@layer utilities` 里 —— 按 CSS 层叠规则，**未分层样式永远压过任何分层样式**，与选择器权重、加载顺序都无关。
 * 结果就是所有 `text-*` / `font-*` 工具类在 `<button>`、`<input>` 上集体失效（选中态文字变黑、FAB 图标变黑、
 * 字号字重失效、焦点环消失）。
 *
 * 把 Vant 装进 `@layer vant` 后，它在层序里低于 base/components/utilities（层序由 `src/styles/index.css`
 * 首行的 `@layer` 声明决定），Tailwind 工具类重新生效，且不需要任何 `!important`。
 */
function vantCssLayer(): Plugin {
  // 层序声明随 Vant 的 CSS 一起下发：Vant 的样式文件在构建产物里可能排在
  // src/styles/index.css 之前（见 dist/index.html 的 <link> 顺序），层序由「第一次出现」决定，
  // 所以每个 Vant CSS 文件都要自带一份完整声明，保证先加载的那个建立出正确顺序。
  const ORDER = '@layer theme, base, vant, components, utilities;';
  return {
    name: 'vant-css-layer',
    enforce: 'pre',
    transform(code, id) {
      const normalized = id.replace(/\\/g, '/');
      if (!normalized.endsWith('.css')) return null;
      if (!normalized.includes('/node_modules/vant/')) return null;
      return { code: `${ORDER}\n@layer vant {\n${code}\n}`, map: null };
    },
  };
}

export default defineConfig({
  plugins: [
    vue(),
    vantCssLayer(),
    // Tailwind v4：通过 @tailwindcss/vite 注入，样式在 src/styles/index.css 中用 @import "tailwindcss"
    tailwindcss(),
    // Vant 按需引入：模板里写 <van-button> 等即自动引入组件与对应样式，不打包未用到的组件
    Components({
      dts: 'src/components.d.ts',
      resolvers: [VantResolver()],
    }),
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
  build: {
    target: 'es2020',
    // 小于 4KB 的静态资源内联进产物：减少 PWA 预缓存条目与离线请求数（REV-40：旧注释「中文名资源」的理由不成立）
    assetsInlineLimit: 4096,
  },
  server: { host: 'localhost', port: 5173 },

  /**
   * 预声明**全部**按需引入的依赖入口。
   *
   * 为什么必须写死：Vite 默认会「边跑边发现」依赖 —— 首次访问某个路由时才扫到新的 import，
   * 于是重新预构建并删除 `node_modules/.vite/deps_temp_*`。某些受控环境（如本机的
   * safe-delete 守卫）会拦截超过阈值的批量删除，导致 dev server **直接抛错退出**
   * （SAFE_DELETE_BULK_CONFIRM_REQUIRED）。
   *
   * 全部预声明后，冷启动时一次预构建完成，后续访问任何路由都不再触发重建。
   *
   * ⚠️ **新增 Vant 组件或新的动态 import 时，必须同步加到这里**，否则又会退化为运行时发现。
   * 当前模板里用到的 Vant 组件：`van-button` / `van-config-provider` / `van-switch`。
   * `html5-qrcode` 是 `ScanSheet.vue` 里的动态 import，同样要预声明。
   */
  optimizeDeps: {
    include: [
      'vant/es',
      'vant/es/button',
      'vant/es/button/style/index',
      'vant/es/config-provider',
      'vant/es/config-provider/style/index',
      'vant/es/switch',
      'vant/es/switch/style/index',
      'html5-qrcode',
    ],
  },
  // 线上部署（反代域名）下预览服务必须放行 Host，否则 Vite 会返回 "Blocked request"
  // 端口读 $PORT：部署沙箱把它注入给服务进程，命令行里展开不可靠
  preview: {
    host: '0.0.0.0',
    allowedHosts: true,
    port: Number(process.env.PORT) || 4173,
    strictPort: true,
  },
});
