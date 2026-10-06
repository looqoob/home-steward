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
    │   ├── dates.ts          # 本地日期字符串工具 + isDateStr 合法性守卫
    │   ├── ids.ts            # ID 生成、稳定哈希
    │   ├── categories.ts     # 品类默认值 + 关键词猜品类
    │   ├── freshness.ts      # 新鲜度状态机（核心概念）
    │   ├── shelfLife.ts      # 保质期解析与到期日计算
    │   ├── itemFactory.ts    # 商品对象构造
    │   ├── locationRules.ts  # 位置删除/计数/排序规则
    │   ├── shoppingRules.ts  # 购物清单自动生成规则 + 按位置分组
    │   ├── stats.ts          # 月度统计、位置分布、浪费趋势/Top/周转/品类
    │   ├── grouping.ts       # v3：同名折叠 + FEFO 排序与消耗
    │   ├── timeline.ts       # v3：到期日时间轴分桶
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
    │   │   ├── schema.ts     # 备份文件格式 + 校验（只校验信封）
    │   │   ├── export.ts     # 导出
    │   │   ├── import.ts     # 导入（replace / merge），写库前先 sanitize
    │   │   └── sanitize.ts   # v3：记录级清洗（脏备份的防线）
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
    │   ├── StockView.vue         # 库存（默认页；分组/时间轴、多选、盘点三种模式）
    │   ├── ListView.vue          # 购物清单（按原因 / 按位置两种分组）
    │   ├── MeView.vue            # 我的
    │   ├── StatsView.vue         # v3：统计（趋势 / Top 浪费 / 周转天数 / 品类分布）
    │   ├── ConsumeLogView.vue    # 消耗明细（逐条消耗记录，从「我的」进入；顶栏由 meta.header 交给外壳渲染）
    │   ├── ItemEditView.vue      # 商品新建/编辑
    │   ├── LocationManageView.vue# 位置管理
    │   ├── DictView.vue          # 保质期字典
    │   ├── AppearanceView.vue    # 外观与主题（深浅模式 + 主题色 + 自定义取色）
    │   ├── SettingsView.vue      # 设置（提醒）
    │   ├── BackupView.vue        # 备份导出导入（含清洗结果上报）
    │   └── README.md
    │
    ├── components/           # 可复用 UI 组件
    │   ├── ItemCard.vue
    │   ├── ItemGroupCard.vue    # v3：同名折叠组卡（库存列表主体）
    │   ├── GroupConsumeSheet.vue# v3：多份选份弹层（FEFO 默认 + 越序警告）
    │   ├── StocktakePanel.vue   # v3：盘点模式面板（还在 / 用掉了 / 扔掉了）
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

### 5.6 同名折叠与 FEFO（v3）

**数据层一条记录 = 一个批次，永不合并。** 两份牛奶 10-08 / 10-15 到期，合并成一行就必然
丢掉「哪一份先过期」，而这恰恰是避免浪费的唯一依据。所以 v3 只在**展示层**把同名同位置
折叠成一张组卡（`ItemGroupCard`），消耗时按 **FEFO**（最早到期先出）选份。

| 层 | 做法 |
| --- | --- |
| 数据层 | 永不合并（`stores/items.addMany` 只在**入库时**且到期日相差 ≤ 1 天才真合并） |
| 展示层 | `domain/grouping.foldItems` 折叠成 `ItemGroup` |
| 消耗层 | `planGroupConsume` / `fefoSlices` 按 FEFO 分配 |

四条必须记住的口径：

1. **折叠键 = `locationId | 名称键`**，名称键三级回退 `item.dictKey` → `aliasKey?.(name)`
   （`data/dict` 的 `foodKeyOf`，依赖注入）→ `normalizeName(name)`。
2. **组卡的状态色 / 排序 / 进度条一律取 `lead`**（组内最早到期那份）。
3. **待办 / 提醒 / 统计一律按「份」，只有库存列表按组折叠**（段头计数也按份）。
4. **折叠必须在分段之前**：`foldItems → sortByFreshness → groupByFreshness`。
   反过来会把同名组切到两段，同一物品重复出现 —— 这是最不能接受的错。

详见 `src/domain/README.md#groupingts--v3同名折叠与-fefo` 与 `docs/V3-CHANGELOG.md`。

### 5.7 外部数据必须过 `isDateStr`（v3）

`Item.expireAt` / `storedAt` / `ConsumeLog.at` 都可能来自**用户手改过的备份 JSON**。
一个 `storedAt: 0` 就会穿透 `diffDays` → `parseDate` → `'(0)'.split` 抛错，
把「我的」「库存」双主 Tab 打成**永久白屏**，而数据 100% 在本机、没有副本可回滚。

三层防御，缺一不可：

| 层 | 位置 | 作用 |
| --- | --- | --- |
| 入口清洗 | `data/backup/sanitize.ts` | 写库**前**修掉/丢弃脏记录，并计数上报 |
| 类型守卫 | `domain/dates.isDateStr` | `freshnessOf` 的判定条件、`stats` 的 `dateOf()` |
| 消费点 | 各聚合函数 | 脏日期那一项当「无日期」跳过，不让整个页面炸 |

`isDateStr` 住在 `domain/dates` 而不是 `data/backup/sanitize`（data 可以依赖 domain，
反之不行）—— 与 `normalizeName` 当初从 data 迁上来是同一回事。

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
| `npm test` | **单元测试**（`vitest run`），当前覆盖 `src/domain/` 全部纯函数 |
| `npm run test:watch` | 测试 watch 模式 |
| `npm run build` | 生产构建 → `dist/`（含 PWA + Service Worker） |
| `npm run preview` | 本地预览构建产物（4173），**用于验证 PWA/SW 行为** |
| `npm run icons` | 重新生成图标到 `public/icons/` |
| `npm run cap:add` | 初始化 Android 工程（首次） |
| `npm run cap:sync` | 构建 + 同步到 Android 工程 |
| `npm run cap:open` | 用 Android Studio 打开 |
| `npm run apk` | 打 debug APK |

### ⚠️ 提交前的双验（必做）

```bash
npm run typecheck && npm test && npm run build
```

`npm run build` 成功 **不保证** 类型正确（Vite 不做全量类型检查）。三条都要过。

### 测试约定（v3 起）

- 配置文件是**独立的 `vitest.config.ts`**（不是 `vite.config.ts`）：`environment: 'node'`，只注册 `@` 别名，
  `include: ['src/**/*.test.ts']`。只测**纯函数**——不依赖 Vue / Dexie / 浏览器 API。
  `data/backup/sanitize.ts` 虽然在 data 层，但同样是纯函数，可以直接测（22 例）。
- 夹具统一放 `src/domain/__tests__/fixtures.ts`（`mkItem` / `mkLocation` / `mkShopping` / `TODAY` / `NOW` / `SETTINGS`）。
  时间基准固定在 `Date.UTC(2026, 9, 5)`，**不要用 `Date.now()`**，否则用例会随日子变化而红。
- 新增领域函数 → 同步补 `src/domain/__tests__/*.test.ts`。
- ⚠️ **夹具里不要用 `s.category ?? 'vegetable'` 兜底**：`category` 允许显式传 `null`，
  `??` 会把 `null` 吞掉，「无品类」这条路径永远测不到。要用
  `s.category === undefined ? 'vegetable' : s.category`。
- ⚠️ 用例挂了先怀疑**自己写的期望值**对不对，别急着改产品代码。已发生过两次把正确行为误判成 bug
  （`urgentDays: 3` 时剩 2 天本来就该进待办）。真 bug 要用独立用例单独钉死，别顺手改掉断言。

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
| 20 | 换了主题色， Vant 按钮/开关还是老绿色 | `--van-primary-color` 写死了 hex | 指向 `var(--primary-600)`；同理 Vant 的颜色变量一律引用项目 token，别写死 |
| 21 | 概览卡显示「今日待吃 3」，点进去待办只有 2 条；或待办里没有它、通知却弹出来 | 数字、列表、通知三处各自实现了一套筛选逻辑，规则一分叉就自相矛盾 | **三处都调 `domain/todo.buildTodayTodo()`**，禁止各筛各的。见 `docs/V2-CHANGELOG.md` §2.1 |
| 22 | 批量入库 20 件卡顿 | 循环调 `items.add()`，而它内部每次都 `await load()`（全量重读 items + logs） | 批量一律走 `items.addMany()` / `bulk*` 方法：`bulkPut` + 单次 `load` |
| 23 | 覆盖导入后旧条码映射残留 | 新增表时只改了 `dexie/sources.ts` 的 `wipe()`，忘了同一文件的 `transaction()` 表清单 | 改表结构要同步**五个地方**（见 `src/data/README.md`「改表结构必须做五件事」） |
| 24 | 条码扫出来永远匹配不上 | `BarcodeEntry.code` 被当成 number 存/传：EAN-13 有前导 0，`Number("0123…")` 会丢 0 | 全链路用 `string`，包括输入框与 `byCode()` 的查询参数 |
| 25 | 关掉扫码页后摄像灯一直亮、持续耗电 | 只调了 `scanner.stop()`，没有显式停视频轨 | `ScanSheet.stopScanner()` 三步：`stop()` → `clear()` → **`video.srcObject.getTracks().forEach(t => t.stop())`** |
| 26 | 长按列表想滚动，却逐张误触进入多选 | 长按计时没有监听 `pointermove` | `ItemCard` 在位移 > 10px 时取消计时。见 `src/components/README.md`「长按防误触」 |
| 27 | 「明天再说」之后物品从库存列表消失了 | 实现时顺手改了 `expireAt` | `snoozeUntil` **只影响待办与通知**，绝不碰 `expireAt`；物品仍在「紧急待吃」分组里 |
| 28 | v2 新字段在旧数据上炸了 | 旧 IndexedDB 记录与 v1 备份里没有 `snoozeUntil` / `inboundItemId` | 这两个字段声明为**可选**，读取时一律 `?? null`，不写 `item.snoozeUntil > now`（依赖隐式转换很脆） |
| 29 | 快速入库弹层滚到底，「加入」按钮下方仍露出滚动内容 | 吸底按钮条是 `sticky`，被钳制在包含块（滚动容器**内容盒**）内；容器自己的 `padding-bottom` 让按钮条永远差一个 pb 到不了弹层底边 | 滚动容器**不给**与 sticky 元素同侧的 padding，留白由 sticky 条自己的 pb 承担（见 `QuickAddSheet`） |
| 30 | 多选态（`?select=1`）分组头悬在距顶 ~55px：上方漏卡片、下方盖住第一张卡的顶部 | 分组头吸顶偏移用的是筛选条实测高度，但多选态筛选条已被 `v-if` 移除，偏移量没跟着变 | 吸顶偏移的**邻居被 v-if 掉时偏移必须同步变**：`groupTop` 在 `selectMode` 下返回 `-1px`（见 `StockView`） |
| 31 | 清单写「西红柿」、历史里存「番茄」，入库默认值还是落到第一个位置 | 以为 `normalizeName` 能等同义词——它只做全角 / 括号 / 空格 / 大小写的归一，**没有同义词表** | 需要别名匹配就给 `domain/inbound` 传 `AliasKeyResolver`（调用方传 `data/dict` 的 `foodKeyOf`）；domain 不得反向依赖 data，与 `ShelfLifeResolver` 同一套路 |
| 32 | 选项对象里声明了却**从没被读**的参数（`remindEveryDays` 就是这样躺了两个版本：备份提醒两种情况都走 `firstAfterDays`，用户 7 天被念一次） | 加了参数就当实现了，没有用例约束；也没有人回头读一遍函数体 | ① 新增可配参数时补一条**专门验证它被用到**的用例（如「备份过走 30 天门槛、未备份走 7 天」）；② 改纯函数前先读一遍函数体，确认每个参数都真的参与了计算 |
| 33 | 一条脏备份记录（`storedAt: 0`）就让「我的」「库存」双主 Tab **永久白屏**，且数据 100% 在本机、无副本可回滚 | `validateBackup` 只校验信封（app 名/版本/数组在不在），记录一条不校验就 `bulkPut`；`storedAt: 0` 穿透到 `monthKey(0)` → `(0).slice is not a function` | **三层防御**：① `data/backup/sanitize.ts` 在写库前清洗（能修的修、缺 id/name 的丢、**计数上报**）；② `domain/dates.isDateStr` 守卫；③ 各消费点脏值跳过。见 §5.7。**新增按日期聚合的函数时照抄 `dateOf()` 守卫** |
| 34 | 同一物品在库存列表里出现两次 | 先按新鲜度分段、再折叠同名组 → 同名组被切到「临期」和「新鲜」两段 | **顺序固定为 `foldItems → sortByFreshness → groupBy*`**，绝不能反。见 §5.6 |
| 35 | 折叠后「名字是西红柿、颜色按番茄」 | 组卡逐份算新鲜度再合并/取最优 | 状态色 / 徽标 / 进度条**一律取 `group.lead`**（`freshnessOf(group.lead, …)`） |
| 36 | `bg-over-bar` 工具类**不报错但静默失效**（柱状图透明） | `--state-*-bar` 没注册进 `index.css` 的 `@theme inline`，Tailwind 不会为它生成工具类 | 用 `var(--state-over-bar)` 引用；要用工具类就先在 `@theme inline` 注册。同理 `--sunken` 不存在，正确名是 `var(--bg-sunken)` |
| 37 | 趋势图看起来「每月各有高峰」，读不出在变好还是变坏 | 每根柱子各自归一化（`amount / 该月最大值`），等于把一张图拆成几张互不相干的图 | 同一组柱子**共用一个全局分母**（`Math.max(...points.map(p => p.amount))`） |
| 38 | 盘点时刚判过的物品又冒出来 | 队列实时读 `items.active`，而每判定一次就消耗掉一件，列表越判越短 | `StocktakePanel` 的 `queue` 是**进入时的快照**（`props.rows.map(r => r.item.id)`），不跟 store 走 |
| 39 | 点「还在」之后统计里多出一堆「消耗 1 个」的假记录 | 盘点三个动作都走 `consume` 写日志 | 「还在」**只推进游标，绝不写日志**。盘点里绝大多数结果都是「还在」 |
| 40 | 组卡取代 `ItemCard` 后，长按多选静默消失 | 折叠后列表主体换成了新组件，长按入口没跟着搬 | `ItemGroupCard` 完整复制 500ms + 10px 位移容差那套；**替换列表主体组件时先核对旧组件的交互清单** |
| 41 | 单份物品卡上出现「共 1 份」 | `dueSummary` 对所有组统一写份数 | 单份组：有日期写日期、无日期写**空串**。写「共 1 份」是噪音，还会让「牛奶 1 盒」看起来像被合并过 |
| 42 | 新设置项在旧数据上读到 `undefined`，页面白屏或分支全走默认 | `Settings` 上新增了字段，但旧 IndexedDB 记录与旧备份里没有它 | 两条路二选一：**可选字段**就 `?? 默认值`（坑位 #28）；**必填字段**（如 `stockViewMode`）就在 `normalizeSettings` 里**白名单校验后回落** `DEFAULT_SETTINGS`，别裸读 `raw.xxx` |
| 43 | 视图偏好做成两个布尔开关后互相打架 | 「分组」和「时间轴」是同一份列表的两种切法，互斥 | 互斥的视图偏好用**一个枚举**（`StockViewMode = 'group' \| 'timeline' \| 'flat'`），两个布尔会出现「都开 / 都关」两种无意义状态；「都不启用」本身就是枚举的一档 |
| 44 | 图标和旁边文字看着**没对齐**（图标整体下沉一截） | SVG 是 inline 元素，默认 `vertical-align: baseline`，浏览器把图标**底边**压在文本基线上，父容器 `items-baseline` 只会把图标一起拖走 | `.icon` 里的 `display: block` 不能删；对齐交给 `.it-icon`（`height: calc(1em * var(--it-lh))` + 内部居中）。见 `docs/ICON-TEXT-SPEC.md` §4 |
| 45 | 同一尺寸的图标在不同页面粗细不一样 | `stroke-width` 逐图标手写，改尺寸时忘记同步 | 描边**恒定 `--icon-stroke: 2.4`（viewBox 单位）**，不随尺寸缩放；SVG 上不再写 `width/height/stroke-width`，改由 `.icon .icon-{档位}` 给。改尺寸只换类，不同步数字 |
| 46 | 「浪费金额」长期是 **¥0**，看起来像「我没浪费钱」 | 三个入库入口（快速入库 / 扫码 / 清单行内）**都不传 `price`**，新建物品单价恒为 `null`；用户得回头进详情页一件件补，那条路径基本没人走 | 入库表单一律带单价输入，并实时显示「合计 = 数量 × 单价」兜住「把整份总价当单价填」的歧义。**新增入库入口时检查它有没有 price** |
| 47 | 金额口径在四处各写一份，最后一份直接漏了物品侧 | `bulk` / `ConsumeSheet` / `GroupConsumeSheet` / `sanitize` 各有一份规则，而 `sanitizeItems` 靠展开原样穿透 —— 手改过的备份里 `"price": "12.5"` 进库后 `price × 数量 = NaN`，整月统计烂掉 | **金额规则只有 `domain/price` 一份**：`normalizePrice` 归一、`amountOf(单价, 数量)` 算本次金额、表单走 `priceFromInput`。`null` = 没填价 ≠ `0` = 真的免费 |
| 48 | 累加金额时直接 `+= l.price ?? 0` | `?? 0` 只挡 `null`/`undefined`，挡不住字符串 —— `"5" + 5` 是**字符串拼接**，结果 `"55"` 再 `round2` 就是 `NaN` | 累加前先 `normalizePrice(l.price) ?? 0`（见 `domain/stats.ts` 三处） |
| 49 | `cap add android` 后 Gradle 配置阶段直接报 `Your project path contains non-ASCII characters` | 本机用户名是中文（`C:\Users\陆乔冰\...`），AGP 默认拒绝含非 ASCII 的工程路径（Windows 中文用户名是重灾区） | `android/gradle.properties` 加 `android.overridePathCheck=true`（AGP 官方开关，issuetracker 227627607）。这只是绕过检查，**真正修法是把工程 / SDK / Gradle 缓存都挪到纯 ASCII 路径**——但本机全在中文用户名下，靠下面 #51/#52 的编码修法兜底 |
| 50 | `./gradlew` 卡在 `Downloading gradle-8.x-all.zip` 然后 `SocketTimeoutException` | 本机网络到 `services.gradle.org` 不通 / 极慢 | `android/gradle/wrapper/gradle-wrapper.properties` 的 `distributionUrl` 改腾讯镜像 `https://mirrors.cloud.tencent.com/gradle/gradle-8.14.3-bin.zip`（`-bin` 不带 docs，路径更短，避免 Windows 超长路径解压失败） |
| 51 | 配了 `HTTPS_PROXY` 环境变量，Gradle 还是 `Connect to repo.maven.apache.org:443 … timed out` | **Java/Gradle 不读 `HTTP_PROXY`/`HTTPS_PROXY` 环境变量**，只能从 `gradle.properties` 的 `systemProp.*` 拿代理 | 在**全局** `GRADLE_USER_HOME/gradle.properties`（本机 `C:\Users\陆乔冰\.gradle\gradle.properties`）写 `systemProp.https.proxyHost=127.0.0.1` + `systemProp.https.proxyPort=<会话代理端口>` + `nonProxyHosts=localhost\|127.0.0.1`。⚠️ 代理端口是会话级的（`echo $HTTPS_PROXY` 拿），换会话要改；**别写进仓库的 `android/gradle.properties`**，否则换机器就炸 |
| 52 | 依赖都下完了，kotlinc 却报 `source file or directory not found: C:\Users\u9646u4E54u51B0\…DateMatch.kt`（一堆 .kt 找不到），连 `android.jar` 都标 `non-existent location` | 路径里的中文用户名在 Gradle→kotlinc worker 传参（argfile）时被按非 UTF-8 编码写/读，变成乱码 `陆乔冰`→`\u9646…`，文件自然找不到 | 全局 `gradle.properties` 给 daemon 强制 UTF-8：`org.gradle.jvmargs=-Xmx2048m -Dfile.encoding=UTF-8 -Dsun.jnu.encoding=UTF-8`（外加 `kotlin.daemon.jvmargs` 同款）。这样工程 / SDK / Gradle 缓存三条含中文路径都能正确寻址 |

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
| 清单按位置分组的顺序 | `src/domain/shoppingRules.ts`（`groupShoppingByLocation`） |
| 同名折叠 / FEFO 消耗 / 入库真合并 | `src/domain/grouping.ts` |
| 库存列表的分组顺序 | `src/domain/freshness.ts`（`groupByFreshness`）；**折叠必须在此之前**，见 §5.6 |
| 时间轴分桶 | `src/domain/timeline.ts` |
| 统计口径 | `src/domain/stats.ts` |
| 备份导入的脏数据清洗 | `src/data/backup/sanitize.ts` |
| 金额口径（单价 / 本次金额） | `src/domain/price.ts`（**唯一定义**，别在别处再拼一遍） |
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
- [ ] **`npm test` 通过**（v3 起是提交前双验之一）
- [ ] `npm run build` 通过
- [ ] 涉及 UI/路由/弹框的改动：跑过 `npm run preview` 并在浏览器里点过（含**安卓返回键**行为）
- [ ] 没有引入 `any`（确需时已用 `unknown` 收窄并注释）
- [ ] 没有违反分层依赖方向（`domain/` 里没有 Dexie / Pinia / Vue / `data/`）
- [ ] **消费外部数据（备份）的日期字段时过了 `isDateStr`**，见 §5.7
- [ ] **改动列表主体组件时核对了旧组件的交互清单**（长按多选等不能静默消失），见坑位 #40
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
| `docs/V2-CHANGELOG.md` | **v2 变更说明**：新概念、一致性约束、备份升版同步清单（改 v2 相关代码前先看） |
| `docs/V3-CHANGELOG.md` | **v3 变更说明**：同名折叠/FEFO 语义、备份清洗三层防御、盘点与统计口径（改 v3 相关代码前先看） |
| `docs/ICON-TEXT-SPEC.md` | **图标 + 文本排版规范**：尺寸档位、描边、间距、垂直对齐换算、迁移清单（动图标前先看） |
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
