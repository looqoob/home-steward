# 家庭物资管家（home-steward）

管理家里物资的移动端 App：**这东西放在哪、什么时候过期、该买什么**。

- **纯本地**：无服务器、无账号、无云同步，数据 100% 存在你自己设备的浏览器数据库里。
- **PWA + APK 一套代码**：可「添加到主屏幕」离线使用，也能打 Android 安装包。
- **零账户上手**：首次打开自动创建 6 个常用位置，不用注册、不用配置。

> 开发者 / AI 接手请看 → **[AGENTS.md](./AGENTS.md)**（含强制的文档同步约定、坑位清单、改动导航）

---

## 功能

| 模块 | 能力 |
| --- | --- |
| **库存** | 三个核心指标（今日待吃 / 已过期 / 本月浪费）、别名搜索、位置筛选、按剩余天数排序的新鲜度卡片 |
| **位置** | 与「环境」解耦：冷藏 / 冷冻 / 阴凉 / 干燥 / 通风 / 避光 / 不计保质期。支持自定义、排序、停用 |
| **保质期** | 四级兜底自动推算（自定义 → 内置字典 → 品类 → 全局），支持手填最高优先；「不建议存放」会给出提示与保守天数 |
| **切换位置实时对比** | 编辑商品时列出所有位置的到期日对比表，直观看到「放冷藏能多放几天」 |
| **购物清单** | 按「库存 0 / 临期替换 / 易浪费 / 手动」四类自动生成，可勾选、可清除已购 |
| **统计** | 本月入库 / 已消耗 / 扔掉金额、位置分布条 |
| **备份** | 导出 JSON（下载或复制），导入支持「合并」与「覆盖」两种模式 |
| **提醒** | APK 用系统本地通知真定时推送；PWA 降级为打开时通知 + App 内提醒条 |

---

## 快速开始

### 环境要求

- Node.js ≥ 20（推荐 22）
- 仅打 APK 时：JDK **21**（非 17）+ Android SDK（compileSdk 36 / minSdk 24）

### 命令

```bash
npm install          # 安装依赖
npm run dev          # 开发服务器 http://localhost:5173
npm run typecheck    # 类型检查
npm run build        # 生产构建 → dist/
npm run preview      # 预览构建产物 http://localhost:4173（验证 PWA 行为用这个）
npm run icons        # 重新生成图标到 public/icons/
```

### 打包 Android（可选）

```bash
npm run cap:add      # 首次：初始化 android/ 工程
npm run cap:sync     # 构建 + 同步到 android/app/src/main/assets/public
npm run apk          # 产出 debug APK
```

> **注意**：`capacitor.config.ts` 里**不要**配置 `server.url`，否则 App 依赖网络、失去离线能力。

---

## 技术栈

Vue 3 + Vite + TypeScript（hash 路由）+ Pinia + Dexie(IndexedDB) + vite-plugin-pwa + Capacitor 8。

分层架构：`domain`（纯函数）→ `data`（持久化抽象 + Dexie 实现）→ `stores`（Pinia 薄层）→ `views / components`。

换持久化实现只需改 `src/data/index.ts` 一行。详见 [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)。

---

## 数据与隐私

- 所有数据存于**本机 IndexedDB**，应用不发起任何业务网络请求。
- 换设备 / 清缓存前请到「我的 → 备份」导出 JSON，否则数据不可恢复。
- 浏览器无痕模式会禁用 IndexedDB，App 会显示明确的错误提示。

---

## 文档索引

| 文件 | 内容 |
| --- | --- |
| [AGENTS.md](./AGENTS.md) | AI / 新人入口：约定、命令、坑位、改动导航 |
| [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) | 分层架构与数据流 |
| [src/domain/README.md](./src/domain/README.md) | 领域层 API |
| [src/data/README.md](./src/data/README.md) | 持久化接口、表结构、备份格式 |
| [src/stores/README.md](./src/stores/README.md) | Pinia store 参考 |
| [src/composables/README.md](./src/composables/README.md) | useReminder / useToast |
| [src/components/README.md](./src/components/README.md) | 组件 props / emits |
| [src/views/README.md](./src/views/README.md) | 页面与路由映射 |
| [src/styles/README.md](./src/styles/README.md) | 设计 token 清单 |

---

## 许可证

私有项目，仅供个人使用。
