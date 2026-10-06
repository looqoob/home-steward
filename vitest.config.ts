import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * 测试专用配置（与 `vite.config.ts` 分开）。
 *
 * 为什么要分开：主配置里挂着 Tailwind / Vant 按需引入 / PWA 插件，跑纯函数测试时
 * 完全用不上，却会让每次启动多花几秒、还可能因为插件副作用影响结果。
 * 这里只保留一件事 —— `@` 别名（与 `vite.config.ts` 的 `resolve.alias` 保持一致）。
 *
 * `environment: 'node'`：`domain/` 是纯函数，不碰 DOM（这正是 AGENTS.md §分层铁律
 * 想要的效果：保质期算法可以在 Node 里直接测，不需要 mock 数据库）。
 * 将来要给组件写测试时，再单独开一个 jsdom 的项目或用 `// @vitest-environment jsdom` 注释。
 */
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
