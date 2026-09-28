# AGENTS.md — 家庭物资管家（home-steward）

> 本文件是 **AI 助手 / 新接手开发者** 的唯一入口。
> 如果你对本项目的记忆为零，读完这份文件就应该能正确改代码、加功能、不踩坑。
>
> **⚠️ 强制约定（最高优先级）**：任何时候你**新增/删除/重命名模块**、**新增或修改对外接口（导出函数、类型、组件 props / emits）**、**变更构建配置 / 依赖 / 环境变量 / 应用配置**，都**必须**在同一次改动中同步更新：
> 1. 本文件 `AGENTS.md`（受影响的小节）
> 2. 对应目录的 `README.md`（如 `src/domain/README.md`）
> 3. 受影响函数/类型上方的 JSDoc 注释
>
> 文档过期视为**构建失败**。CI 检查清单见文末「提交前自检」。

---

## 1. 项目定位

家庭物资管家是一个**纯本地优先（local-first）** 的移动端 App，用来管理家里「放在哪、什么时候过期」。

四条不可动摇的产品底线：

| 底线 | 含义 | 代码中的体现 |
| --- | --- | --- |
| **无服务器** | 没有任何后端 API、没有任何网络请求（除静态资源自身） | `src/` 内无 `fetch`/`axios`，无 `.env` |
| **无账号** | 没有登录、没有用户表、没有鉴权 | `src/domain/types.ts` 无 `User` 类型 |
| **无云同步** | 数据同步只能靠手工导出/导入 JSON 文件 | `src/data/backup/` |
| **数据 100% 存本机** | 唯一持久化落点是设备 IndexedDB | `src/data/dexie/` |

因此：**永远不要**引入需要联网的特性（远程字典、遥测、CDN 字体、在线更新字典等）。新增能力必须是离线可用的。

### 交付形态

- **PWA（当前默认）**：`vite-plugin-pwa` 生成 Service Worker，可添加到主屏幕、离线可用。
- **原生 APK（Capacitor 8 壳）**：同一套 Web 产物 + Capacitor 原生容器。RecyclerView 之外的部分只有一个 WebView。
- **两套壳共用一套代码**，差异只在 `src/main.ts`（是否注册 SW）与 `src/composables/useReminder.ts`（真通知 vs 降级提示）。

---

## 2. 技术栈与版本约束

| 技术 | 版本 | 说明 |
| --- | --- | --- |
| Vue | 3.5.x | `<script setup lang="ts">` 风格 |
| Vite | 8.x | hash 模式路由，base 相对路径 |
| TypeScript | **锁定 5.6.3** | ⚠️ **不要升级到 TS 7**，见 §10 坑位 |
| vue-router | 5.x | **hash 模式**（`createWebHashHistory`） |
| Pinia | 4.x | **setup store** 写法（非 options store） |
| Dexie | 4.x | IndexedDB 封装 |
| Sass | 1.x | 仅用 SCSS 变量/嵌套，不用 mixin 库 |
| vite-plugin-pwa | 1.x | workbox-build / workbox-window 7.x 需显式安装 |
| Capacitor | 8.x | core / android / cli + @capacitor/app、@capacitor/local-notifications |
| sharp | 0.35.x | 仅 `scripts/gen-icons.mjs` 用，生成图标 |

**为什么用 hash 路由**：PWA 离线深链 + Capacitor 的 `https://localhost` 场景，history 模式的 fallback 在两种壳里都不稳定。

---

## 3. 目录结构与职责

```
home-steward/
├── AGENTS.md                 # 本文件：AI/新人入口
├── README.md                 # GitHub 首页：产品简介 + 快速开始
├── index.html                # 入口 HTML，theme-color 必须与白顶栏一致
├── vite.config.ts            # Vite + PWA + alias(@) 配置
├── capacitor.config.ts       # Capacitor：appId / webDir（禁止配 server.url）
├── tsconfig.json             # paths: @/* → src/*
├── package.json
│
├── scripts/
│   └── gen-icons.mjs         # sharp 生成 PWA / APK 图标 → public/icons/
│
├── public/
│   └── icons/                # ★ 图标必须在这里才会进 dist 并被预缓存
│
├── docs/
│   └── ARCHITECTURE.md       # 分层架构详解 + 数据流图
│
└── src/
    ├── main.ts               # 应用挂载；原生壳跳过 SW 注册
    ├── App.vue               # 启动引导：存储探针 → 播种 → 加载 stores
    │
    ├── domain/               # 【第 1 层】纯函数，零依赖
    │   ├── types.ts          # 全部实体类型、枚举、常量（ENV_MAP 等）
    │   ├── dates.ts          # 本地日期字符串工具
    │   ├── ids.ts            # ID 生成、稳定哈希
    │   ├── categories.ts     # 品类默认值 + 关键词猜品类
    │   ├── freshness.ts      # 新鲜度状态机（核心概念）
    │   ├── shelfLife.ts      # 保质期解析与到期日计算
    │   ├── itemFactory.ts    # 商品对象构造
    │   ├── locationRules.ts  # 位置删除/计数/排序规则
    │   ├── shoppingRules.ts  # 购物清单自动生成规则
    │   ├── stats.ts          # 月度统计、位置分布
    │   └── README.md
    │
    ├── data/                 # 【第 2 层】持久化
    │   ├── repository.ts     # 抽象接口（Repository / DataSources）
    │   ├── index.ts          # ★ 选型唯一硬编码点：export const db
    │   ├── seed.ts           # 首次启动预设位置
    │   ├── dexie/
    │   │   ├── db.ts         # Dexie 表定义与索引
    │   │   └── sources.ts    # DataSources 的 Dexie 实现
    │   ├── dict/
    │   │   ├── builtin.ts    # 内置食材字典（稀疏矩阵）
    │   │   ├── index.ts      # 四级兜底查询解析
    │   │   └── normalize.ts  # 名称归一化（全角/括号/别名）
    │   ├── backup/
    │   │   ├── schema.ts     # 备份文件格式 + 校验
    │   │   ├── export.ts     # 导出
    │   │   └── import.ts     # 导入（replace / merge）
    │   └── README.md
    │
    ├── stores/               # 【第 3 层】Pinia 薄层
    │   ├── items.ts          # 商品 + 消耗日志
    │   ├── locations.ts      # 位置
    │   ├── dict.ts           # 自定义字典
    │   ├── shopping.ts       # 购物清单
    │   ├── settings.ts       # 单例设置
    │   └── README.md
    │
    ├── composables/          # 跨模块可复用逻辑
    │   ├── useReminder.ts    # 临期提醒（原生通知 / Web 降级）
    │   ├── useToast.ts       # 全局轻提示（模块级单例 state）
    │   └── README.md
    │
    ├── layouts/
    │   └── TabLayout.vue     # 底部 Tab 外壳 + 白顶栏 + FAB + 快速入库弹框
    ├── router/index.ts       # 全部路由，懒加载导入
    │
    ├── views/                # 页面级组件（一个路由一个）
    │   ├── StockView.vue         # 库存（默认页）
    │   ├── ListView.vue          # 购物清单
    │   ├── MeView.vue            # 我的 / 统计
    │   ├── ItemEditView.vue      # 商品新建/编辑
    │   ├── LocationManageView.vue# 位置管理
    │   ├── DictView.vue          # 保质期字典
    │   ├── SettingsView.vue      # 设置
    │   ├── BackupView.vue        # 备份导出导入
    │   └── README.md
    │
    ├── components/           # 可复用 UI 组件
    │   ├── ItemCard.vue
    │   ├── LocationChipBar.vue
    │   ├── NavBar.vue            # 子页顶栏（含返回）
    │   ├── QuickAddSheet.vue     # 快速入库底部弹框
    │   └── README.md
    │
    └── styles/
        ├── _tokens.scss      # ★ 设计系统唯一真源（颜色/字号/圆角/间距）
        ├── base.scss         # reset + 全局原子类
        ├── components.scss   # 卡片/按钮/标签/Tabbar 等组件样式
        └── README.md
```

---

## 4. 分层架构（必须遵守）

```
┌──────────────────────────────────────────────┐
│  views/  components/  layouts/                │  UI：只允许调 store 和 composable
├──────────────────────────────────────────────┤
│  stores/  composables/                        │  Pinia：持有响应式状态，调 domain + data
├──────────────────────────────────────────────┤
│  domain/                                      │  纯函数：无副作用、不 import data/stores
├──────────────────────────────────────────────┤
│  data/                                        │  持久化：Dexie 实现 + 抽象接口
└──────────────────────────────────────────────┘
```

**依赖方向只能向下，不能向上、不能跨层。**

| 层 | 允许 import | 禁止 import |
| --- | --- | --- |
| `domain/` | 仅 `./` 同层 | ❌ Dexie ❌ Pinia ❌ Vue ❌ 任何 `data/`、`stores/` |
| `data/` | `domain/`、Dexie | ❌ Pinia ❌ Vue 组件 |
| `stores/` | `domain/`、`data/`、`composables/`、其他 store | ❌ Vue 组件 |
| `views/`、`components/` | 以上全部 | — |

这条规则的价值：`domain/` 里的保质期算法可以在 **Node 里直接单元测试**，不需要 mock 数据库。破坏它等于放弃可测试性。

### 换持久化只改一行

`src/data/index.ts` 是**唯一**硬编码选型的地方：

```ts
export const db: DataSources = createDexieSources();  // ← 换成 createSqliteSources() 即可
```

业务代码一律 `import { db } from '@/data'`，**永远不要**直接 `import { dexieDb } from '@/data/dexie/db'`。

---

## 5. 核心领域概念

改业务逻辑前必须理解这几个概念，否则一定改错。

### 5.1 环境（EnvType）与位置（Location）解耦

**环境决定保质期，位置只是环境的载体。** 多个位置可以同环境（冰箱冷藏 / 冷蔵室抽屉都是 `chilled`）。

`EnvType`：`chilled` | `frozen` | `cool` | `dry` | `ventilated` | `dark` | `none`

`none` = 不计保质期（日用品预留）。`src/domain/types.ts` 的 `ENV_MAP` 是环境 → 文案/颜色/圆点的**单一真源**，UI 里禁止硬编码「冷藏」。

### 5.2 新鲜度四态（FreshnessState）

`freshnessOf(item, today, settings)` 返回 `{ state, label, remainDays, progress, sortKey }`：

| state | 判定 | 排序权重 |
| --- | --- | --- |
| `fresh` | `d > soonDays` | `d` |
| `soon` | `urgentDays < d ≤ soonDays` | `d` |
| `urgent` | `0 ≤ d ≤ urgentDays` | `d` |
| `over` | `d < 0` | `d`（负数，最靠前） |
| `warn` | 无到期日 且 `notRecommended` | `1e9 - 1` |
| `none` | 无到期日 | `1e9`（最后） |

- `progress` 视觉进度条，**钳制在 `[0.04, 1]`**（原型要求过期时也留一点可见条）。
- 列表排序用 `sortByFreshness`，按剩余天数升序 + 同名中文排序兜底。

### 5.3 保质期四级兜底

`src/data/dict/index.ts` 的 `resolveWith()`：

```
① 用户自定义字典 (source: 'custom')
② 内置食材字典   (source: 'builtin')
③ 品类默认值     (source: 'category')
④ 全局环境默认值 (source: 'global')
⑤ 都没有 → null (source: 'none')，提示用户手填
```

另外两条**优先级高于全部上述**：

- **`manualShelfLife`（手填）**：用户一旦设定，永远优先，**切换位置也不覆盖**，不会因为换位置就被字典冲掉。
- **`NOT_RECOMMENDED`（哨兵 `-1`）**：表示「这东西不该放这环境」（如香蕉放冷藏）。命中时 `expireAt = null`，UI 显示「不建议存放」并给出坚持存放的保守天数（`fallbackDays`）。

字典是**稀疏矩阵**：`{ key, category, envs: Partial<Record<EnvType, number>>, aliases, notRecommendedReason }`。没有的组合留空，交给下一级兜底。

### 5.4 名称归一化

`normalizeName()`：全角转半角 → 去括号内容 → 去空白 → 转小写。
所以「番茄（西红柿）」「西红柿」「TOMATO」都能命中同一条字典（`aliases`）。

### 5.5 软删除

除 `Settings` 外的所有实体都有 `deletedAt: number | null`。
**仓库层的 `all()` / `byId()` 已自动过滤 `deletedAt`**，业务层不需要到处写 `.filter(i => !i.deletedAt)`，但 UI 层的 store getter（`active` / `visible`）出于性能仍保留过滤，两者不冲突。

注意 `ConsumeLog` **没有** `updatedAt` 字段 —— 写通用工具函数时不能用 `updatedAt` 做硬约束（这是踩过的坑）。

---

## 6. UI / 交互约定（视觉必须 1:1 复刻原型）

### 6.1 设计系统

- **唯一真源**：`src/styles/_tokens.scss`（颜色、字号、圆角、间距、阴影）。
- 手写 SCSS，**不引入任何 UI 组件库**（Vant / Element 等都不要）。
- 环境色取：`@/domain/types` 的 `ENV_MAP`（包含 `color` 与 `dotClass`），禁止在 UI 里复制粘贴色值。

### 6.2 三个易错点（必看）

1. **选中态用 `--primary-600`，不是 500。**
2. **位置标签是中性灰底 + 彩色圆点**，不是彩色底。
3. **Pinia setup store 的 `computed` 在 store 实例上已自动解包** → 视图里写 `dict.resolve`，**不能**写 `dict.resolve.value`。同理 `ref` 也直接访问。

### 6.3 顶栏规范

- `TabLayout`（三个主 Tab）：**纯白背景、不显示标题**（底部 Tab 已表明页面）。`.topbar` 只负责安全区高度。
- 子页（字典/设置/备份/位置管理/商品编辑）：用 `NavBar.vue`，保留标题 + 返回按钮。
- `index.html` 的 `theme-color` 和 manifest 的 `theme_color` **必须同为 `#FFFFFF`**（不是品牌绿），否则状态栏会出现一条绿边。
- 顶栏用 **负 margin + 等量 padding** 让白色延伸到状态栏：
  ```scss
  margin-top: calc(-1 * env(safe-area-inset-top, 0px));
  padding-top: env(safe-area-inset-top, 0px);
  ```

### 6.4 FAB（快速入库）

右下角 FAB **只在库存 Tab 显示**（`v-if="isStock"`，判据 `route.path.startsWith('/stock')`）。其他 Tab 必须隐藏。

### 6.5 ★ 弹框的返回键处理（重要模式）

**所有全屏/半屏弹框的开合状态必须用「路由 query 驱动」，禁止用局部 `ref`。**

```ts
// TabLayout.vue —— 唯一正确写法
const quickAddOpen = computed(() => route.query.quickadd === '1');
function openQuickAdd() { router.push({ path: '/stock', query: { quickadd: '1' } }); }
function closeQuickAdd() { if (route.query.quickadd) router.back(); }
```

为什么：

- 安卓返回键被 popstate 直接消费，如果用局部 ref，会出现「页面跳走了但弹框还开着」。
- query 驱动后，`router.back()` 只回退这一条历史记录 → **关闭弹框且不跳页**（`path` 恒为 `/stock`）。
- 弹框**内部**的跨页跳转必须用 `router.replace`（不是 `push`），否则会多一条历史记录，导致返回时弹框复现。

新增任何弹框都照抄这个模式，并在 `src/components/README.md` 登记。

---

## 7. 环境准备

### 前置要求

| 工具 | 版本 | 备注 |
| --- | --- | --- |
| Node.js | ≥ 20（推荐 22） | |
| npm | ≥ 10 | |
| JDK | **21** | 仅打 APK 需要；Capacitor 8 不支持 JDK 17 |
| Android SDK | compileSdk / targetSdk 36，minSdk 24 | 仅打 APK 需要 |

### 安装

```bash
npm install
```

⚠️ `sharp` 是可选依赖，装不上时图标生成会失败，但**构建本身不受影响**。已在 `.npmrc` 无关的情况下若仍失败，重试即可。

---

## 8. 常用命令

| 命令 | 作用 |
| --- | --- |
| `npm run dev` | 开发服务器（默认 5173） |
| `npm run typecheck` | **类型检查**（`vue-tsc --noEmit`），不产出文件 |
| `npm run build` | 生产构建 → `dist/`（含 PWA + Service Worker） |
| `npm run preview` | 本地预览构建产物（4173），**用于验证 PWA/SW 行为** |
| `npm run icons` | 重新生成图标到 `public/icons/` |
| `npm run cap:add` | 初始化 Android 工程（首次） |
| `npm run cap:sync` | 构建 + 同步到 Android 工程 |
| `npm run cap:open` | 用 Android Studio 打开 |
| `npm run apk` | 打 debug APK |

### ⚠️ 提交前的双验（必做）

```bash
npm run typecheck && npm run build
```

`npm run build` 成功 **不保证** 类型正确（Vite 不做全量类型检查）。两条都要过。

### 最短可靠验证流程

```bash
npm run typecheck          # 1. 类型
npm run build              # 2. 构建
npm run preview            # 3. 浏览器打开 http://localhost:4173 冒烟
```

功能性 / 交互性改动（尤其是路由、弹框、PWA）**必须**用 `preview` 验证，不能只看 `dev`。原因：dev 不注册 Service Worker，行为与线上不一致。

---

## 9. 代码风格与命名约定

### TypeScript

- 严格模式；**不用 `any`**。确实需要时用 `unknown` 收窄，或 `as never` 适配已有签名（见 `locations.ts`），并在注释里说明。
- 类型只从 `@/domain/types` 引入，禁止在 UI 层重复定义实体形状。
- 联合字面量类型优于 `enum`（序列化后是字符串，进 IndexedDB 更安全）。

### 文件与符号命名

| 类别 | 规则 | 示例 |
| --- | --- | --- |
| Vue 组件文件 | PascalCase | `ItemCard.vue` |
| domain / data 模块 | camelCase | `shelfLife.ts`、`itemFactory.ts` |
| 导出函数 | 动词开头 camelCase | `computeExpiry`、`canDeleteLocation` |
| 导出类型 | PascalCase | `Freshness`、`ResolveResult` |
| 常量 | UPPER_SNAKE | `ENV_MAP`、`DEFAULT_SETTINGS` |
| SCSS 变量 | kebab-case，双横线前缀 | `--primary-600`、`--state-fresh-bar` |
| CSS 类 | kebab-case | `.b-fresh`、`.table.mini` |
| store id | camelCase | `'items'`、`'shopping'` |

### 组件导入：**必须默认导入**

`<script setup>` 只暴露 **default 导出**，具名导入会在构建时报 `[MISSING_EXPORT]`：

```ts
import ItemCard from '@/components/ItemCard.vue';   // ✅
import { ItemCard } from '@/components/ItemCard.vue'; // ❌ 构建失败
```

### 路径别名

始终用 `@/` → `src/`，禁止用 `../../` 相对路径跨越模块边界。

### Vue / SCSS

- `<script setup lang="ts">`；`<style scoped lang="scss">`。
- 组件样式中的颜色/间距必须走 `_tokens.scss` 的变量，不要写魔法值。
- 每个 `.vue` 文件的 `<script setup>` 顶部用一句话注释说明组件职责。

### 注释

- 公共函数（跨模块调用）**必须**有 JSDoc：`@param` / `@returns` / 抛错或边界条件 / `@example`。
- 注释用**简体中文**。
- 注释解释 **why**（为什么这么做），不是 **what**（代码已经在说 what）。

### Git

- 提交信息用 Conventional Commits：`feat:` `fix:` `docs:` `refactor:` `perf:` `test:` `chore:`
- 一个提交做一件事；不要把「重构 + 改功能 + 改文档」混在一起。

---

## 10. 已知坑位（踩过的，别再踩）

| # | 坑 | 原因 | 对策 |
| --- | --- | --- | --- |
| 1 | `vue-tsc` 报 `ERR_PACKAGE_PATH_NOT_EXPORTED: './lib/tsc'` | TypeScript 7 移除了该导出 | **锁 `typescript@5.6.3`**，不要升级 |
| 2 | 具名导入 `.vue` → `[MISSING_EXPORT]` | `<script setup>` 无具名导出 | 见 §9 组件导入 |
| 3 | `dict.resolve.value` 编译报错 | Pinia setup store 已解包 | 去掉 `.value` |
| 4 | `dist/icons/` 缺失、预缓存条目少 | 图标放在项目根 `icons/` 不会进 dist | 图标必须放 `public/icons/`，`gen-icons.mjs` 已指向该目录 |
| 5 | 用 `curl` 探测资源返回 200 误判成功 | SPA fallback 会把任何路径返回 index.html | 必须校验 `content-type`（如 `image/png`） |
| 6 | 原生壳里改了代码 APK 还是旧的 | WebView 加载本地资源，SW 缓存了旧版本 | `main.ts` 必须 `if (!Capacitor.isNativePlatform()) registerSW(...)` |
| 7 | 安卓上 SCHEDULE_EXACT_ALARM 崩溃 / 通知不弹 | Android 12+ 精确闹钟需特殊权限 | `LocalNotifications.schedule({ schedule: { at } })` **不设 `exact`** |
| 8 | 通用合并函数对 `ConsumeLog` 类型报错 | `ConsumeLog` 无 `updatedAt` | 合并键用 `updatedAt ?? createdAt` |
| 9 | `vite.config.ts` 里 `api: 'modern-compiler'` 类型报错 | sass options 类型滞后 | 断言 `as Record<string, unknown>` |
| 10 | Capacitor 报 JDK 版本不对 | Capacitor 8 需 JDK 21 | 装 JDK 21 并设 `JAVA_HOME` |
| 11 | 部署工具报 `domainPrefix is required` | 必填项遗漏 | 发布时显式传 `home-steward` |
| 12 | Bash 里 `cd` 到含反斜杠的中文路径失败 | 反斜杠被吞掉 | 一律用**正斜杠** |

---

## 11. 常见改动场景导航

| 我想改… | 去这里 |
| --- | --- |
| 某个食材的保质期 | `src/data/dict/builtin.ts` |
| 某个环境的默认天数 | `src/domain/categories.ts`（`GLOBAL_DEFAULTS`） |
| 品类默认天数 / 关键词归类 | `src/domain/categories.ts`（`CATEGORY_DEFAULTS`、`KEYWORDS`） |
| 新鲜度阈值 / 颜色 | `src/domain/freshness.ts` + `_tokens.scss` |
| 到期日算法 | `src/domain/shelfLife.ts` |
| 购物清单自动生成规则 | `src/domain/shoppingRules.ts` |
| 统计口径 | `src/domain/stats.ts` |
| 换个数据库 | `src/data/index.ts`（一行）+ 新增 sources 实现 |
| 数据库表/索引 | `src/data/dexie/db.ts`（改后**必须**升 `SCHEMA_VERSION` 并在 import 处做版本兼容） |
| 备份文件格式 | `src/data/backup/schema.ts`（改后**必须**升 `SCHEMA_VERSION`） |
| 顶部 Tab / FAB / 弹框返回键 | `src/layouts/TabLayout.vue` |
| 新增路由 | `src/router/index.ts`（懒加载 `() => import('@/views/Xxx.vue')`） |
| 主题色 / 间距 / 圆角 | `src/styles/_tokens.scss` |
| 提醒时间 / 通知方式 | `src/composables/useReminder.ts` |
| appId / 包名 | `capacitor.config.ts` |

---

## 12. 提交前自检清单

改完代码，逐条打勾：

- [ ] `npm run typecheck` 通过
- [ ] `npm run build` 通过
- [ ] 涉及 UI/路由/弹框的改动：跑过 `npm run preview` 并在浏览器里点过（含**安卓返回键**行为）
- [ ] 没有引入 `any`（确需时已用 `unknown` 收窄并注释）
- [ ] 没有违反分层依赖方向（`domain/` 里没有 Dexie / Pinia / Vue）
- [ ] 业务代码没有直接 import `data/dexie/db.ts`
- [ ] 新增/修改的公共函数有 JSDoc（参数、返回值、边界条件、示例）
- [ ] **新增/删除/重命名了模块 → 已更新对应目录 `README.md`**
- [ ] **新增/修改了对外接口 → 已更新 `AGENTS.md` 对应小节**
- [ ] **改了构建配置 / 依赖 / 环境变量 → 已更新 `AGENTS.md` §2 与 §7**
- [ ] 遗漏检查：没有引入网络请求、账号、云同步
- [ ] Git 提交信息符合 Conventional Commits

---

## 13. 更多文档

| 文件 | 内容 |
| --- | --- |
| `README.md` | 产品简介、快速开始、GitHub 首页 |
| `docs/ARCHITECTURE.md` | 分层架构详解、数据流图、换存储实操 |
| `src/domain/README.md` | 领域层全部纯函数 API 参考 |
| `src/data/README.md` | 持久化接口、表结构、备份格式 |
| `src/stores/README.md` | 各 Pinia store 的状态与方法 |
| `src/composables/README.md` | useReminder / useToast |
| `src/components/README.md` | 组件 props / emits / 用法 |
| `src/views/README.md` | 页面职责与路由映射 |
| `src/styles/README.md` | 设计 token 清单与用法 |

---

**文档维护原则**：文档不是写给别人看的作业，是**未来的自己（或下一个 AI）不踩坑的唯一保险**。改了代码不改文档，等于给下一次改动埋雷。
