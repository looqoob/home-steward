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
| Vant | 4.x | 移动端组件库；按需在 `vite.config.ts` 用 `unplugin-vue-components` + `VantResolver` 自动导入（见 §6.1 / §13） |
| TailwindCSS | v4 | utility-first 样式；`@tailwindcss/vite` 插件 + `@theme inline` 把设计 token 映射成工具类（见 §6.1） |
| unplugin-vue-components | 1.x | 仅用于 Vant 按需导入（`VantResolver`），并生成 `src/components.d.ts` |
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
├── index.html                # 入口 HTML，theme-color 有浅/深两套，必须与顶栏背景一致
├── vite.config.ts            # Vite + PWA + Tailwind + Vant 按需(VantResolver) + alias(@) 配置
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
    │   ├── accent.ts         # 主题色：预设色板 + 对比度校正 + 色阶派生（纯函数）
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
    │   ├── useTheme.ts       # 外观主题（深浅 + 主题色）→ 写 html[data-theme] 与 --primary-* 内联变量
    │   └── README.md
    │
    ├── layouts/
    │   └── TabLayout.vue     # 底部 Tab 外壳 + 白顶栏 + meta.header 子页顶栏 + FAB + 快速入库弹框
    ├── router/index.ts       # 全部路由，懒加载导入
    │
    ├── views/                # 页面级组件（一个路由一个）
    │   ├── StockView.vue         # 库存（默认页）
    │   ├── ListView.vue          # 购物清单
    │   ├── MeView.vue            # 我的 / 统计
    │   ├── ConsumeLogView.vue    # 消耗明细（逐条消耗记录，从「我的」进入；顶栏由 meta.header 交给外壳渲染）
    │   ├── ItemEditView.vue      # 商品新建/编辑
    │   ├── LocationManageView.vue# 位置管理
    │   ├── DictView.vue          # 保质期字典
    │   ├── AppearanceView.vue    # 外观与主题（深浅模式 + 主题色 + 自定义取色）
    │   ├── SettingsView.vue      # 设置（提醒）
    │   ├── BackupView.vue        # 备份导出导入
    │   └── README.md
    │
    ├── components/           # 可复用 UI 组件
    │   ├── ItemCard.vue
    │   ├── LocationChipBar.vue
    │   ├── NavBar.vue            # 子页顶栏（含返回）
    │   ├── SearchField.vue       # 列表页搜索框（原生 input + 放大镜，40px 胶囊）
    │   ├── QuickAddSheet.vue     # 快速入库底部弹框
    │   ├── ConfirmSheet.vue      # 二次确认弹层（删除 / 覆盖导入等破坏性操作）
    │   ├── ConsumeSheet.vue       # 部分消耗数量选择（一次只用掉几个）
    │   └── README.md
    │
    └── styles/
        ├── index.css         # ★ 设计系统唯一真源（颜色/字号/圆角/间距）+ Tailwind 入口 + Vant 主题变量
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

- **唯一真源**：`src/styles/index.css` —— `:root` 集中定义设计 token（颜色 `--color-*`、字号、圆角、间距、阴影、环境点色），再用 `@theme inline` 映射成 Tailwind 工具类（`bg-page` / `bg-card` / `text-ink-1` / `bg-primary-600` …）。**禁止在组件里写魔法色值**，一律用工具类或 `var(--color-*)`。
- **组件库用 Vant 4（按需）**：只保留按钮 `van-button`、开关 `van-switch`、`van-config-provider`（深色模式）三类。**表单类控件一律手写**：输入框用原生 `<input>` + 项目输入样式，搜索用 `components/SearchField.vue`（`van-field` / `van-search` 由 `van-cell` 拼成，自带两层固定行高与内边距，和 40/44px 的设计高度对不齐，已弃用）。高度自定义的卡片（如 `ItemCard.vue`、`LocationChipBar.vue`）保留手写实现。**不再手写整套 SCSS 组件样式**。Vant 由 `unplugin-vue-components` + `VantResolver` 在编译期自动按需导入，已声明组件见 `src/components.d.ts`（新增 Vant 组件后该文件会被自动补全，未覆盖到的需手动补一行类型声明）。
- **Vant 主题色**：在 `index.css` 里覆盖 `--van-primary-color` 等为品牌绿 `#228055`，使 Vant 组件与项目主题一致；深色模式通过 `@media (prefers-color-scheme: dark)` 覆盖 `:root` token，并由 `App.vue` 的 `van-config-provider :theme` 同步切换。
- 环境色取：`@/domain/types` 的 `ENV_MAP`（包含 `color` 与 `dotClass`），禁止在 UI 里复制粘贴色值。

### 6.2 三个易错点（必看）

1. **选中态用 `--primary-600`，不是 500。**
2. **位置标签是中性灰底 + 彩色圆点**，不是彩色底。
3. **Pinia setup store 的 `computed` 在 store 实例上已自动解包** → 视图里写 `dict.resolve`，**不能**写 `dict.resolve.value`。同理 `ref` 也直接访问。

### 6.3 顶栏规范

- `TabLayout`（三个主 Tab）：**纯白背景、不显示标题**（底部 Tab 已表明页面）。顶部的纯白占位只负责安全区高度（`env(safe-area-inset-top) + 12px`）。
- **独立路由子页**（商品编辑 / 位置管理 / 字典 / 设置 / 备份）：页面自己渲染 `NavBar.vue`（标题 + 返回），它是页面根容器（`flex flex-col h-full`）的首个 flex item —— 位于滚动容器**外面**，所以不随内容滚动、天然占满整宽。
- **★ 挂在 TabLayout 下、又需要标题栏的页面**（如 `/consume-log` 消耗明细）：在路由上写 `meta: { header: '标题' }`，由 `TabLayout` 把 `NavBar` 渲染在滚动容器**外面**；**页面里不要再写 `<NavBar>`**，否则出现两条顶栏。这样它才和底部 Tab 一样贴死边缘、不随内容滚动。
  - 代价：这类页面的滚动容器 `padding` 会被置为 `pt-0 pb-0`（`TabLayout.padClass`），上下留白改由页面内的**普通流占位元素**提供（如 `ConsumeLogView` 的 `h-5`）。
  - 原因：`sticky` 的偏移量相对**内容盒**计算，容器 `padding` 会把吸顶 / 吸底条朝内推，与容器边缘之间漏出一条能看到滚动卡片的缝。改这类页面前先看 `src/styles/README.md`「吸顶层」规则 5。
- `NavBar` 自己承担状态栏安全区（`pt-[env(safe-area-inset-top,0px)]` + `h-[calc(48px+env(...))]`），由外壳渲染时 `TabLayout` 就**不再**渲染那块 12px 纯白占位，避免白色多出一截。
- `index.html` 的 `theme-color` 只有**一份**，值由 `useTheme` 在切换时写入（浅 `#FFFFFF` / 深 `#1C211F`，与 `--bg-card` 同步）。**不要再改成「两套 meta + `media="(prefers-color-scheme: dark)"`」** —— 用户手选深色但系统是浅色时状态栏会错。manifest 的 `theme_color` 同理只有一份。

### 6.4 ★ 外观主题（深浅 + 主题色）

用户可选 `light` / `dark` / `system`（存 `settings.themeMode`）+ 主色（`settings.accent`）。完整约定见 `src/domain/README.md`（配色算法）与 `src/composables/README.md`（运行时），这里只记四条**改错就出 bug** 的硬规则：

1. **深色变量挂在 `html[data-theme='dark']` 上，不是 `@media (prefers-color-scheme: dark)`。** 媒体查询无法被应用内状态覆盖，用户手选浅色但系统是深色时会失效。`system` 模式在 JS 里解析成实际值后写进 `data-theme`。
2. **首屏防闪烁靠 `index.html` 里的内联脚本** + localStorage 镜像 `hs.theme`（Dexie 是异步的，首帧读不到）。改镜像 key / 结构必须同步改 `useTheme.ts` 的 `MIRROR_KEY`。**内联脚本不能用外部文件替代**（外部文件是异步的，防不住闪烁）。
3. **主题色整条色阶由 JS 算好后写成 `<html>` 的 inline style**（`--primary-50…700`、`--focus-ring`、`--accent`）。inline 优先级高于 `:root`，所以 CSS 里的色板只是「JS 还没跑」时的兜底。不要用 CSS `color-mix()` 代替：那样做不了「对比度不达标继续调」的闭环。
4. **语义色不跟随主题色**：环境色（`ENV_MAP`）与新鲜度四态（fresh/soon/urgent/over）保持固定 —— 跟着品牌色变会让「冷藏=蓝、临期=橙」的语义失效。

### 6.5 FAB（快速入库）

右下角 FAB **只在库存 Tab 显示**（`v-if="isStock"`，判据 `route.path.startsWith('/stock')`）。其他 Tab 必须隐藏。

### 6.6 ★ 弹框的返回键处理（重要模式）

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
| CSS 变量（设计 token） | kebab-case，双横线前缀 | `--color-page`、`--van-primary-color` |
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

### Vue / 样式（Tailwind + Vant）

- `<script setup lang="ts">`；**不需要** `<style scoped>`——样式全部用 Tailwind 工具类写在元素行内；仅在「需要父选择器 / 伪元素 / keyframes / 局部媒体查询」等 Tailwind 表达不了的场景才写 `<style scoped>`。
- 颜色 / 间距 / 圆角一律走 `index.css` 的工具类（`bg-card` / `text-ink-1` / `bg-primary-600` …）或 `var(--color-*)`，**不要写魔法值**。
- 基础组件优先用 Vant（`van-button` / `van-switch` / `van-config-provider` …）；Vant 由插件按需导入，无需手动 `import`。**表单控件（输入框 / 搜索框）不用 Vant**，见 §13。
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
| 9 | 用了某个 Vant 组件却报 `VanXxx is not defined` | `components.d.ts` 未生成 / 未覆盖该组件 | 重启 `dev` 让 `unplugin-vue-components` 重新生成 `src/components.d.ts`；仍缺失则在文件里手动补一行 `VanXxx: typeof import('vant/es')['Xxx']` |
| 10 | Capacitor 报 JDK 版本不对 | Capacitor 8 需 JDK 21 | 装 JDK 21 并设 `JAVA_HOME` |
| 11 | 部署工具报 `domainPrefix is required` | 必填项遗漏 | 发布时显式传 `home-steward` |
| 12 | Bash 里 `cd` 到含反斜杠的中文路径失败 | 反斜杠被吞掉 | 一律用**正斜杠** |
| 13 | 打开 `/item/new` 显示「该物资不存在或已删除」、标题是「编辑物资」 | 若同时存在静态路由 `/item/new`，它会抢在 `/item/:id` 前匹配，导致 `route.params.id` 为 `undefined`，而 `ItemEditView` 判定 `isNew = id === 'new'` | **不要**注册静态的 `/item/new`；让它由 `/item/:id` 匹配（`params.id === 'new'`）。见 §11 新增路由 |
| 14 | Vant 迁移后按钮/选中 chip 的文字全是黑色、字号字重失效 | CSS 层叠里**分层比较先于选择器权重**：Vant 自带的 unlayered 全局规则（`input,button,textarea{color:inherit;font:inherit}` 等）压过 `@layer utilities` 里的所有 Tailwind 工具类 | 保持 `vite.config.ts` 的 `vantCssLayer()` 插件与 `index.css` 首行的层序声明，别把规则写到 unlayered 位置。见 §13 样式与组件库集成 |
| 15 | 整页忽宽忽窄（库存页 480px 溢出屏幕、消耗明细页只有 323px） | `van-config-provider` 渲染出一个真实 div，作为 `#app`（flex 容器）唯一的 flex item，`width:auto` 退化成「内容宽度」 | `index.css` 的 `@layer components` 里有 `.van-config-provider{width:100%}`，勿删；`#app` 的居中与 480px 上限由内部根容器的 `max-w-[480px] mx-auto` 负责 |
| 16 | **发布后用户反馈「线上还是旧的」，但 curl 抓到的 index.html 已是新资源哈希** | PWA 的 Service Worker 早在上一版就把 index.html 与 assets 预缓存了；`skipWaiting` + `clientsClaim` 只保证**新 SW 接管**，不会让**已渲染的旧页面**重绘，用户眼前仍是旧 UI | ① 先用 curl 比对 `index.html` 的资源哈希，确认服务端确实是新版（这一步排除部署失败）；② 用户侧硬刷新或清站点数据一次；③ 长期由 `main.ts` 兜底：`controllerchange` 时 reload 一次 + 每 30 分钟在页面可见时 `reg.update()`。**不要因为它「看着没变」就反复重新发布** |
| 17 | 证明了错的域名：看到形如 `home-steward-42425.app.workbuddy.host` 的链接且打不开 | 那不是本项目的发布地址（本项目固定为 `home-steward` 前缀） | 以 `https://home-steward.app.workbuddy.host/` 为准，其余一律忽略 |
| 16 | 顶栏下方 / 合计条下方露出一条卡片边（滚动时卡片像"穿过"了吸顶、吸底条） | `sticky` 的偏移量相对**内容盒**计算：滚动容器的 `padding-top/bottom` 会把吸顶 / 吸底条朝内推一个 padding，条与容器边缘之间留出一条缝 | 带 sticky 条的页面，容器必须 `pt-0`（必要时 `pb-0`）——见 `TabLayout.padClass`；留白改用页面内的普通流占位元素（`StockView` 顶部的 16px 占位 `<div class="h-4">`、`ConsumeLogView` 的 `h-5`）。详见 §6.3 与 `src/styles/README.md`「吸顶层」规则 5 |
| 17 | 底部 Tab 的「库存」图标看着像缺一角、画不全 | 内联 SVG 的 `d` 被写坏（圆弧参数 `a2 2 0 0 0` 掉了一个 `2` 变成 `a2 0 0 0`），外加几条超出框体的辅助线，小尺寸下就成了「残图」 | 换图标时**改完要在浏览器里放大看一眼**；缺参数的 path 不报错、只是画得不对。图标一律内联 SVG + `currentColor`，笔画粗细对齐（1.9–2.2） |
| 18 | 用户手选「浅色」但系统是深色，整页还是黑的 | 深色变量挂在 `@media (prefers-color-scheme: dark)` 上，媒体查询无法被应用内状态覆盖 | 深色变量只挂 `html[data-theme='dark']`；`data-theme` 由 `index.html` 内联脚本（首帧前，读 localStorage 镜像 `hs.theme`）+ `useTheme` 维护。详见 §6.4 与 `src/styles/README.md`「深色模式与主题色」 |
| 19 | 自定义主题色后按钮白字看不清 / 按钮陷进背景 | 主色直接拿来用，没做对比度校正（用户可能选荧光黄、近白、近黑） | 主色必须过 `domain/accent.ts` 的 `resolveAccent`（白字 ≥4.5、与底色 ≥3，文字优先），色阶由 `accentScale` 派生后写 inline style。不要在 CSS 里 `color-mix()` 派生——做不了「不达标继续调」的闭环 |
| 20 | 换了主题色，Vant 按钮/开关还是老绿色 | `--van-primary-color` 写死了 hex | 指向 `var(--primary-600)`；同理 Vant 的颜色变量一律引用项目 token，别写死 |

---

## 11. 常见改动场景导航

| 我想改… | 去这里 |
| --- | --- |
| 某个食材的保质期 | `src/data/dict/builtin.ts` |
| 某个环境的默认天数 | `src/domain/categories.ts`（`GLOBAL_DEFAULTS`） |
| 品类默认天数 / 关键词归类 | `src/domain/categories.ts`（`CATEGORY_DEFAULTS`、`KEYWORDS`） |
| 新鲜度阈值 / 颜色 | `src/domain/freshness.ts` + `src/styles/index.css` |
| 到期日算法 | `src/domain/shelfLife.ts` |
| 购物清单自动生成规则 | `src/domain/shoppingRules.ts` |
| 统计口径 | `src/domain/stats.ts` |
| 换个数据库 | `src/data/index.ts`（一行）+ 新增 sources 实现 |
| 数据库表/索引 | `src/data/dexie/db.ts`（改后**必须**升 `SCHEMA_VERSION` 并在 import 处做版本兼容） |
| 备份文件格式 | `src/data/backup/schema.ts`（改后**必须**升 `SCHEMA_VERSION`） |
| 顶部 Tab / FAB / 弹框返回键 | `src/layouts/TabLayout.vue` |
| 子页顶栏 / 标题 / 吸顶层留白 | `src/layouts/TabLayout.vue`（`meta.header` 页面）+ `src/components/NavBar.vue`；路由写 `meta: { header: '标题' }` |
| 列表页搜索框 | `src/components/SearchField.vue` |
| 新增路由 | `src/router/index.ts`（懒加载 `() => import('@/views/Xxx.vue')`） |
| 主题色 / 间距 / 圆角 | `src/styles/index.css` |
| 提醒时间 / 通知方式 | `src/composables/useReminder.ts` |
| appId / 包名 | `capacitor.config.ts` |

---

## 13. 样式与组件库集成（Tailwind v4 + Vant 4）

本项目的样式方案在 2026-09 由「手写 SCSS」切换为「Tailwind 工具类 + Vant 按需组件」，相关改动见 `package.json` / `vite.config.ts` / `src/styles/index.css` / `src/main.ts` / `src/App.vue`。

- **Tailwind v4（无 `tailwind.config.js`）**：样式入口是 `src/styles/index.css`，首行 `@import "tailwindcss";`。设计 token 写在 `:root`，再用 `@theme inline` 把 `--color-*` 等映射成 `bg-*` / `text-*` / `border-*` 等工具类。新增颜色 token 只需在 `:root` 加 `--color-xxx` 并在 `@theme inline` 里挂上即可，无需改配置。深色模式靠 `@media (prefers-color-scheme: dark)` 覆盖 `:root` 的 token 变量（不是覆盖工具类）。
- **层叠分层（★ 必须理解，否则样式会静默失效）**：Tailwind 的工具类在 `@layer utilities` 里，而 CSS 规则是「**分层比较先于选择器权重**」——低优先级层里的规则，即使权重更高也会输给高优先级层。Vant 自带样式里有多条全局元素选择器（`input,button,textarea{color:inherit;font:inherit}`、`*:focus{outline:none}`），所以 `vite.config.ts` 的 `vantCssLayer()` 插件把所有 Vant CSS 包进 `@layer vant`，层序由 `@layer theme, base, vant, components, utilities;` 声明（同时写在 `index.css` 首行**和**每个 Vant CSS 文件头部——因为构建产物里 Vant CSS 可能排在 `index.css` 之前，层序按「第一次出现」生效）。改样式时不要把规则写到 unlayered 位置，也不要删除该插件。
- **`main.ts` 的导入顺序**：`import './styles/index.css'` 必须在 `import App.vue` 之前（dev 下决定 `<style>` 注入顺序）。
- **Vant 按需导入**：`vite.config.ts` 的 `Components({ resolvers: [VantResolver()] })` 会在编译期把模板里出现的 `van-xxx` 自动导入并生成 `src/components.d.ts`。**不要把 Vant 组件显式 `import` 进 `.vue`**；若 TS 报 `VanXxx is not defined`，先看 `components.d.ts` 是否覆盖，缺了就重启 `dev` 或手动补类型声明。当前只用 `van-button` / `van-switch` / `van-config-provider`；**输入框一律用原生 `<input>` + 项目输入样式**（`van-field` 的固定宽度标签会挤压输入区），**搜索框用 `components/SearchField.vue`**（`van-field` / `van-search` 的固定行高与内边距和 40/44px 的设计高度对不齐，均已弃用）。
- **选中态写法（★ 约定）**：chip / 分段控件 / 卡片的选中与未选中配色必须写成**互斥的三元表达式**（如 `:class="sel ? 'bg-primary-600 border-primary-600 text-white font-medium' : 'bg-card border-line text-ink-2'"`），**不要**「静态类 + 条件类叠加」——两个同类工具类谁生效取决于 CSS 里的先后顺序，顺序一变选中态就失效。
- **Vant 主题**：在 `index.css` 用 `--van-*` 变量对齐设计系统（圆角 12px、按钮 44px/14px 等）。`App.vue` 用 `van-config-provider :theme` 跟随系统深浅色切换 Vant 内置暗色；`van-config-provider` 渲染出的 div 是 `#app`（flex）里唯一的 flex item，宽度会退化成「内容宽度」，`index.css` 里用 `.van-config-provider{width:100%}` 修正，勿删。
- **保留手写的组件**：`ItemCard.vue`、`LocationChipBar.vue`、`SearchField.vue`、`QuickAddSheet.vue` 的网格/卡片结构、步进器、搜索框、底部弹框等高度自定义部分仍是手写 Tailwind，不替换为 Vant 等价物（Vant 没有完全对等的组件，或对等物高度不可控）。图标（＋/−/删除/搜索等）一律用内联 SVG + `currentColor`，不用全角字符或 emoji。
- **删除的旧文件**：`src/styles/_tokens.scss`、`base.scss`、`components.scss` 已删除，所有样式迁移到 `index.css` + 行内工具类。

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

## 14. 更多文档

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
