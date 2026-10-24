# AGENTS.md — 家庭物资管家（home-steward）

> 本文件是 **AI 助手 / 新接手开发者** 的唯一入口。
> 如果你对本项目的记忆为零，读完这份文件就应该能正确改代码、加功能、不踩坑。
>
> **⚠️ 强制约定（最高优先级）**：
>
> 1. **文档同步**：新增/删除/重命名模块、新增或修改对外接口（导出函数、类型、组件 props / emits）、
>    变更构建配置 / 依赖 / 环境变量时，必须在**同一次改动**中同步更新：本文件（受影响小节）、
>    对应目录的 `README.md`、受影响函数/类型上方的 JSDoc。**文档过期视为构建失败。**
> 2. **批次登记**：每**完成**一个批次、每**梳理出新需求批次**，都必须当天在 `docs/BATCHES.md`
>    （批次台账）登记一行；逐项改动写进明细文档的「落地记录」小节。未进台账的批次视为没有发生。
> 3. **坑位登记**：踩到新坑当天记入 `docs/PITFALLS.md`（全量坑位表，本文件 §10 只有速查）。

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
- **原生 APK（Capacitor 8 壳）**：同一套 Web 产物 + Capacitor 原生容器（除 WebView 外只有一个 RecyclerView）。
- **两套壳共用一套代码**，差异只在 `src/main.ts`（是否注册 SW）与 `src/composables/useReminder.ts`（真通知 vs 降级提示）。

---

## 2. 技术栈与版本约束

| 技术 | 版本 | 说明 |
| --- | --- | --- |
| Vue | 3.5.x | `<script setup lang="ts">` 风格 |
| Vite | 8.x | hash 模式路由；**未配 `base`**（按根路径部署，子路径部署会白屏，改前先评估） |
| TypeScript | **锁定 5.6.3** | ⚠️ **不要升级到 TS 7**（`vue-tsc` 会挂，坑位 #1） |
| vue-router | 5.x | **hash 模式**（`createWebHashHistory`）；PWA 离线深链 + Capacitor 场景下 history 模式不稳 |
| Pinia | 4.x | **setup store** 写法（非 options store） |
| Dexie | 4.x | IndexedDB 封装 |
| Vant | 4.x | 移动端组件库，按需自动导入（见 §6.1） |
| TailwindCSS | v4 | utility-first；`@tailwindcss/vite` 插件，无 `tailwind.config.js`（见 §6.1） |
| unplugin-vue-components | 1.x | 仅用于 Vant 按需导入（`VantResolver`），生成 `src/components.d.ts` |
| vite-plugin-pwa | 1.x | workbox-build / workbox-window 7.x 需显式安装 |
| Capacitor | 8.x | core / android / cli + @capacitor/app（暂未被 import，移除需重跑 `cap sync`）、@capacitor/local-notifications |
| sharp | 0.35.x | 仅 `scripts/gen-icons.mjs` 用，生成图标 |

---

## 3. 目录结构与职责

```
home-steward/
├── AGENTS.md                 # 本文件：AI/新人入口
├── README.md                 # GitHub 首页：产品简介 + 快速开始
├── index.html                # 入口 HTML；theme-color 只有一份，由 useTheme 写入
├── vite.config.ts            # Vite + PWA + Tailwind + Vant 按需 + vantCssLayer + alias(@)
├── capacitor.config.ts       # appId / webDir（禁止配 server.url）
├── tsconfig.json             # paths: @/* → src/*
│
├── scripts/
│   ├── gen-icons.mjs         # sharp 生成 PWA / APK 图标 → public/icons/
│   └── apk.mjs               # 跨平台调 Gradle Wrapper（npm run apk / apk:release）
│
├── public/
│   └── icons/                # ★ 图标必须在这里才会进 dist 并被预缓存
│
├── docs/
│   ├── ARCHITECTURE.md       # 分层架构详解 + 数据流图
│   ├── BATCHES.md            # ★ 批次台账（完成/新需求批次强制登记处）
│   ├── PITFALLS.md           # ★ 已知坑位全表（AGENTS §10 只有速查）
│   ├── ITERATION-REVIEW.md   # v1.0 迭代评审 + 批次 1~5 落地记录 + v1.1 功能规划（§15）
│   ├── V2-CHANGELOG.md       # v2 新概念与坑（清单入库/待办/批量/条码）
│   ├── V3-CHANGELOG.md       # v3 新概念与坑（折叠/FEFO/清洗/盘点/统计）
│   ├── DESIGN-REVIEW.md      # 无障碍与视觉层级评审（A/B/C 三批，已修）
│   ├── ICON-TEXT-SPEC.md     # 图标 + 文本排版规范（尺寸/描边/对齐）
│   └── 使用教程.md            # 面向最终用户的操作教程
│
└── src/
    ├── main.ts               # 挂载；原生壳跳过 SW；Quota 兜底
    ├── App.vue               # 启动引导：探针→播种→加载 stores→生成清单→提醒→跨标签同步
    │
    ├── domain/               # 【第 1 层】纯函数，零依赖（详见 src/domain/README.md）
    │   ├── types.ts          # 全部实体类型、枚举、常量（ENV_MAP 等，UI 色彩单一真源）
    │   ├── dates.ts          # 本地日期字符串工具 + isDateStr 守卫（外部数据必过）
    │   ├── ids.ts            # ID 生成、稳定哈希
    │   ├── categories.ts     # 品类默认值 + 关键词猜品类（KEYWORDS 顺序敏感）
    │   ├── freshness.ts      # 新鲜度状态机（核心概念，见 §5.2）
    │   ├── shelfLife.ts      # 保质期解析与到期日计算、位置对比
    │   ├── itemFactory.ts    # 商品对象构造（dictKey 定格处，必须传 aliasKey）
    │   ├── locationRules.ts  # 位置删除校验 + countsByLocation 计数聚合
    │   ├── shoppingRules.ts  # 清单自动生成（DISMISS_DAYS 唯一定义）+ 按位置分组
    │   ├── stats.ts          # 月度统计、位置分布（含未分配桶）、趋势/Top/周转/品类
    │   ├── grouping.ts       # 同名折叠 + FEFO（见 §5.6）
    │   ├── timeline.ts       # 到期日时间轴分桶
    │   ├── todo.ts           # 今日待办（数字/列表/通知三处同源）
    │   ├── inbound.ts        # 清单入库默认值推断（AliasKeyResolver 注入）
    │   ├── bulk.ts           # 批量操作规划 + buildConsumeLog（全项目唯一日志构造）
    │   ├── price.ts          # 金额口径唯一定义（normalizePrice/amountOf/round2）
    │   ├── quantity.ts       # 数量格式化
    │   ├── settings.ts       # 设置归一（旧数据/导入共用单一真源）
    │   ├── accent.ts         # 主题色：色板 + 对比度校正 + 色阶派生
    │   ├── normalize.ts      # 名称归一化（全角/括号/空白/大小写）
    │   └── __tests__/        # 纯函数测试 + fixtures
    │
    ├── data/                 # 【第 2 层】持久化（详见 src/data/README.md）
    │   ├── repository.ts     # 抽象接口（Repository / DataSources）
    │   ├── index.ts          # ★ 选型唯一硬编码点：export const db
    │   ├── seed.ts           # 首次启动预设位置（判据 countAll）
    │   ├── dexie/            # db.ts 表定义与索引；sources.ts Dexie 实现
    │   ├── dict/             # builtin.ts 内置字典 / index.ts 四级兜底 / normalize.ts 转出层
    │   ├── backup/           # schema / export / import（写库前 sanitize）/ sanitize
    │   └── sync.ts           # 跨标签写同步广播（BroadcastChannel）
    │
    ├── stores/               # 【第 3 层】Pinia 薄层（详见 src/stores/README.md）
    │   └── items / locations / dict / shopping / settings
    │
    ├── composables/          # 跨模块复用逻辑（详见 src/composables/README.md）
    │   ├── useReminder.ts    # 临期提醒（原生通知 / Web 降级，设置变更即重排程）
    │   ├── useToast.ts       # 全局轻提示（模块级单例）
    │   ├── useSafeArea.ts    # 顶部安全区真源 → 写 <html> 的 --safe-top
    │   ├── useNow.ts         # 响应式当前时刻/今天（60s 心跳 + 回前台刷新），跨零点真源
    │   └── useTheme.ts       # 外观主题 → 写 html[data-theme] 与 --primary-* 内联变量
    │
    ├── layouts/TabLayout.vue # 底部 Tab 外壳 + meta.header 子页顶栏 + FAB + 快速入库
    ├── router/index.ts       # 全部路由，懒加载；子页标题用 meta.header
    │
    ├── views/                # 页面级组件（一个路由一个，详见 src/views/README.md）
    │   ├── StockView.vue         # 库存（默认页；分组/时间轴/平铺、多选、盘点三模式）
    │   ├── ListView.vue          # 购物清单（按原因 / 按位置）
    │   ├── MeView.vue            # 我的（月度概览 + 位置分布）
    │   ├── StatsView.vue         # 统计（趋势 / Top / 周转 / 品类 / 在库价值）
    │   ├── ConsumeLogView.vue    # 消耗明细（meta.header 外壳顶栏）
    │   ├── ItemEditView.vue      # 商品新建/编辑（含位置对比、改价、改名刷新 dictKey）
    │   ├── LocationManageView.vue# 位置管理
    │   ├── DictView.vue          # 保质期字典（保存即自动重算在库商品）
    │   ├── BarcodeManageView.vue # 条码映射管理
    │   ├── AppearanceView.vue    # 外观与主题
    │   ├── SettingsView.vue      # 设置（提醒 + 库存视图偏好）
    │   ├── BackupView.vue        # 备份导出导入（清洗结果上报 + 覆盖快照撤销）
    │   ├── RecentOpsView.vue     # v1.1 F1：最近操作（消耗流水逐条撤销）
    │   └── ChangelogView.vue     # v1.1：更新日志（发版必须追加条目）
    │
    ├── components/           # 可复用 UI 组件（详见 src/components/README.md）
    │   ├── ItemGroupCard.vue     # ★ 库存列表主体：同名折叠组卡（单份退化为普通卡）
    │   ├── TodayTodo.vue         # 今日待办区块
    │   ├── StocktakePanel.vue    # 盘点面板（队列必须是快照）
    │   ├── GroupConsumeSheet.vue # 多份选份弹层（FEFO 默认 + 越序警告）
    │   ├── ConsumeSheet.vue      # 部分消耗数量选择
    │   ├── QuickAddSheet.vue     # 快速入库底部弹框（含单价与合计）
    │   ├── ScanSheet.vue         # 扫码入库（忙锁 + 去重 + 停扫三步）
    │   ├── ShoppingInboundRow.vue# 清单行内入库卡
    │   ├── LocationPickerSheet.vue / LocationChipBar.vue
    │   ├── NavBar.vue / PageShell.vue / PageHeader.vue   # 子页骨架与顶栏
    │   ├── BottomSheet.vue / ConfirmSheet.vue            # 弹层脚手架与二次确认
    │   ├── FormField.vue / Pill.vue / PillGroup.vue / QtyStepper.vue / StatCard.vue
    │   ├── EmptyState.vue / IconText.vue / SearchField.vue / BulkActionBar.vue
    │   ├── OnboardingOverlay.vue   # v1.1 F10：首启引导（3 步，App.vue 条件挂载）
    │   └── components.d.ts       # unplugin 自动生成的 Vant 组件声明
    │
    └── styles/
        └── index.css         # ★ 设计系统唯一真源 + Tailwind 入口 + Vant 主题变量
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

这条规则的价值：`domain/` 里的保质期算法可以在 **Node 里直接单元测试**，不需要 mock 数据库。破坏它等于放弃可测试性。需要 data 能力时（如字典别名）用**依赖注入**（`ShelfLifeResolver` / `AliasKeyResolver` 由 store 层传入），而不是让 domain 反向 import。

### 换持久化只改一行

`src/data/index.ts` 是**唯一**硬编码选型的地方：`export const db: DataSources = createDexieSources();`。
业务代码一律 `import { db } from '@/data'`，**永远不要**直接 `import { dexieDb } from '@/data/dexie/db'`。

---

## 5. 核心领域概念

改业务逻辑前必须理解这些概念，否则一定改错。完整 API 见 `src/domain/README.md`。

### 5.1 环境（EnvType）与位置（Location）解耦

**环境决定保质期，位置只是环境的载体。** 多个位置可同环境（冰箱冷藏 / 冷藏室抽屉都是 `chilled`）。
`EnvType`：`chilled | frozen | cool | dry | ventilated | dark | none`；`none` = 不计保质期（日用品预留）。
`src/domain/types.ts` 的 `ENV_MAP` 是环境 → 文案/颜色/圆点的**单一真源**，UI 里禁止硬编码「冷藏」。

### 5.2 新鲜度六态（FreshnessState）

`freshnessOf(item, today, settings)` 返回 `{ state, label, remainDays, progress, sortKey }`：

| state | 判定 | sortKey |
| --- | --- | --- |
| `fresh` | `d > soonDays` | `d` |
| `soon` | `urgentDays < d ≤ soonDays` | `d` |
| `urgent` | `0 ≤ d ≤ urgentDays` | `d` |
| `over` | `d < 0` | `d`（负数，最靠前） |
| `warn` | 无到期日 且 `notRecommended` | `1e9 - 1` |
| `none` | 无到期日 | `1e9`（最后） |

- `progress` 钳制在 `[0.04, 1]`（过期也留一点可见条）。
- 列表排序用 `sortByFreshness`（剩余天数升序 + 中文名兜底）。
- ⚠️ `today` 必须来自 `useToday()`（响应式），**禁止 `const today = todayStr()` 定格**——PWA 挂后台跨零点会整天停在昨天。

### 5.3 保质期四级兜底

`src/data/dict/index.ts` 的 `resolveWith()`：① 用户自定义 → ② 内置字典 → ③ 品类默认 → ④ 全局环境默认 → 都没有则 `null`（提示手填）。

两条**优先级高于全部上述**：

- **`manualShelfLife`（手填）**：一旦设定永远优先，**切换位置也不覆盖**。
- **`NOT_RECOMMENDED`（哨兵 `-1`）**：「这东西不该放这环境」（如香蕉放冷藏）。命中时 `expireAt = null`，UI 显示「不建议存放」+ 保守天数（`fallbackDays`）。

字典是**稀疏矩阵**：`{ key, category, envs: Partial<Record<EnvType, number>>, aliases, notRecommendedReason }`，没填的组合交给下一级兜底。

### 5.4 名称归一化与别名

- `normalizeName()`（domain/normalize）：全角转半角 → 去括号内容 → 去空白 → 转小写。「番茄（西红柿）」「西红柿」「TOMATO」归一后相同。
- ⚠️ 归一**没有同义词表**：「番茄」≠「西红柿」。需要别名匹配时必须注入 `data/dict` 的 `foodKeyOf`（`AliasKeyResolver`），domain 不得反向依赖 data。

### 5.5 软删除

- 除 `Settings` 外所有实体都有 `deletedAt: number | null`；仓库层 `all()` / `byId()` 已自动过滤，UI store getter 仍保留过滤（性能），两者不冲突。
- ⚠️ 正因 `all()` 滤了软删，「从没存在过」和「删光了」它分不清——**判断「是否首次启动」必须用 `countAll()`**（含软删行），否则位置删光后会重播预设（坑位 #60）。
- 需要读**含软删行**的场景（忽略抑制、merge 的 tombstone 比较）用 `allIncludingDeleted()`。
- `ConsumeLog` **没有** `updatedAt` —— 通用工具函数不能用 `updatedAt` 做硬约束。

### 5.6 同名折叠与 FEFO（v3）

**数据层一条记录 = 一个批次，永不合并。** 两份牛奶 10-08 / 10-15 到期，合并必然丢掉「哪份先过期」——那正是避免浪费的唯一依据。只在**展示层**折叠成组卡（`ItemGroupCard`），消耗按 **FEFO**（最早到期先出）选份；入库时到期日相差 ≤ 1 天才真合并（清单「全部入库」必须传 `{ merge: false }`，坑位 #56）。

四条必须记住的口径：

1. **折叠键 = `locationId | 名称键 | unit`**。名称键 = `(dictKey ?? name)` **先过 `aliasKey?.(…)`（`foodKeyOf`）再退 `normalizeName(…)`** —— 不能直接拿 dictKey 当键：旧数据的 dictKey 是原始输入名，直接比对会让别名折叠对存量数据失效（坑位 #66）。**带 unit**：「2 盒 + 1 袋」不能折成「3 盒」。
2. **组卡的状态色 / 排序 / 进度条一律取 `lead`**（组内最早到期那份）。
3. **待办 / 提醒 / 统计一律按「份」，只有库存列表按组折叠**（段头计数也按份）。
4. **折叠必须在分段之前**：`foldItems → sortByFreshness → groupByFreshness`。反过来会把同名组切到两段（坑位 #34）。

### 5.7 外部数据必须过 `isDateStr`（v3）

`expireAt` / `storedAt` / `ConsumeLog.at` 都可能来自**用户手改过的备份 JSON**。一个 `storedAt: 0` 就会穿透 `diffDays` → `parseDate` 抛错，把双主 Tab 打成**永久白屏**，而数据 100% 在本机、没有副本可回滚。三层防御缺一不可：

| 层 | 位置 | 作用 |
| --- | --- | --- |
| 入口清洗 | `data/backup/sanitize.ts` | 写库**前**修/丢脏记录并计数上报（日期还要过**往返校验**：`2026-13-01` 这种假日期按非法处理） |
| 类型守卫 | `domain/dates.isDateStr` | `freshnessOf` 判定条件、`stats` 的 `dateOf()`/`epochOf()` |
| 消费点 | 各聚合函数 | 脏值当「无日期」跳过，不让整页炸 |

`isDateStr` 住在 domain（data 可依赖 domain，反之不行）——与 `normalizeName` 当初从 data 迁上来同理。

---

## 6. UI / 交互约定（视觉必须 1:1 复刻原型）

### 6.1 设计系统与组件库（Tailwind v4 + Vant 4）

- **唯一真源**：`src/styles/index.css` —— `:root` 定义设计 token，`@theme inline` 映射成工具类（`bg-page` / `bg-card` / `text-ink-1` / `bg-primary-600`…）。**禁止组件里写魔法色值**；环境色一律取 `ENV_MAP`。
- **Tailwind v4 无配置文件**：新增颜色 token 在 `:root` 加 `--color-xxx` 并挂进 `@theme inline` 即可。深色模式**覆盖 token 变量**（挂在 `html[data-theme='dark']`），不覆盖工具类。
- **★ 层叠分层（样式静默失效的头号原因）**：Tailwind 工具类在 `@layer utilities`，而 CSS「**分层比较先于选择器权重**」。Vant 自带 unlayered 全局规则（`input,button{color:inherit;font:inherit}` 等）会压过一切工具类。`vite.config.ts` 的 `vantCssLayer()` 插件把 Vant CSS 包进 `@layer vant`，层序 `@layer theme, base, vant, components, utilities;` 同时写在 `index.css` 首行**和**每个 Vant CSS 文件头部（层序按「第一次出现」生效）。**不要删该插件，不要把规则写到 unlayered 位置**（坑位 #14）。
- **`main.ts` 导入顺序**：`import './styles/index.css'` 必须在 `import App.vue` 之前（决定 dev 下 `<style>` 注入顺序）。
- **Vant 按需**：模板里写 `van-xxx` 即自动导入并生成 `src/components.d.ts`；**不要显式 import**。当前只用 `van-button` / `van-switch` / `van-config-provider`。**表单控件一律手写**：输入框用原生 `<input>` + `.field-input`（`van-field` 固定标签宽度会挤压输入区），搜索用 `SearchField.vue`。Vant 主题变量（`--van-primary-color` 等）一律引用项目 token（`var(--primary-600)`），别写死 hex。
- **选中态写法（★ 约定）**：互斥的**三元表达式**（`:class="sel ? 'bg-primary-600 …' : 'bg-card …'"`），**不要**「静态类 + 条件类叠加」——同类工具类谁生效取决于 CSS 先后顺序（坑位 #20 同族）。
- **手写不换 Vant**：组卡、步进器、底部弹框、搜索框等高度自定义部分保持手写 Tailwind。图标一律内联 SVG + `currentColor`（规范见 `docs/ICON-TEXT-SPEC.md`）。
- **⚠️ 输入类字号必须 ≥ 16px**：iOS / 部分 WebView 对 <16px 输入框聚焦会**整页放大且失焦不还原**（坑位 #64）。视觉尺寸靠外框高度与内边距收。

### 6.2 三个易错点

1. **选中态用 `--primary-600`，不是 500。**
2. **位置标签是中性灰底 + 彩色圆点**，不是彩色底。
3. **Pinia setup store 的 `computed`/`ref` 在实例上已自动解包** → 视图里写 `dict.resolve`，**不能**写 `dict.resolve.value`。

### 6.3 顶栏规范

- **★ 顶部安全区只有 `--safe-top` 一个真源**：`useSafeArea.ts` 在 `app.mount` 之前把实测值写成 `<html>` 的 inline `--safe-top`（`env()` 在 Android WebView 里恒为 0，坑位 #53）。**组件一律 `pt-[var(--safe-top)]`，禁止再写 `env(safe-area-inset-top)`**。安全区逻辑只在 `NavBar` 写一次，二级页用 `NavBar` / `PageShell` / `meta.header` 任一方式即自动带上。
- `TabLayout`（三个主 Tab）：纯白背景、不显示标题；顶部纯白占位负责「安全区 + 12px」。
- **独立路由子页**：页面自己渲染 `NavBar.vue`，它是页面根容器首个 flex item——在滚动容器**外面**，不随内容滚动。
- **★ TabLayout 下又需要标题栏的页面**：路由写 `meta: { header: '标题' }`，由外壳渲染 NavBar；**页面里不要再写 `<NavBar>`**。代价：滚动容器 `pt-0 pb-0`，留白由页面内普通流占位元素提供（`sticky` 偏移相对内容盒，容器 padding 会漏缝，坑位 #16b）。
- **固定头部 + 内滚列表（v1.1 F8/F9 模式，所有 Tab 页强制）**：`TabLayout` 的内容区是**纯外壳**（`flex-1 min-h-0 overflow-hidden px-4`——不滚动、无垂直 padding，只保留水平 px-4 供页面 -mx-4 全出血）。每个 Tab 子页面必须自治滚动：列表页（库存/清单/我的/消耗明细）是 `h-full flex flex-col`（头部 `flex-none` + 列表 `flex-1 min-h-0 overflow-y-auto`）；整页内容型（统计页）是 `h-full overflow-y-auto`。垂直留白与 FAB / 多选操作条让位（库存列表 `pb-[84px]` / 多选 `pb-[132px]`）由页面自己承担。分组头 `sticky top-[-1px]` 直吸列表容器顶，零测量；吸底条加 `z-[20]`（要压过 z-[19] 的分组头）。
- `index.html` 的 `theme-color` / manifest 的 `theme_color` 只有**一份**，由 `useTheme` 切换时写入（浅 `#FFFFFF` / 深 `#1C211F`）。**不要改成两套 meta + media 查询**——用户手选深色但系统浅色时状态栏会错。

### 6.4 ★ 外观主题（深浅 + 主题色）

`light` / `dark` / `system`（存 `settings.themeMode`）+ 主色（`settings.accent`）。四条**改错就出 bug** 的硬规则：

1. **深色变量挂 `html[data-theme='dark']`，不是 `@media (prefers-color-scheme: dark)`**（媒体查询无法被应用内状态覆盖，坑位 #18）。
2. **首屏防闪烁靠 `index.html` 内联脚本** + localStorage 镜像 `hs.theme`（改镜像 key 必须同步改 `useTheme.ts` 的 `MIRROR_KEY`；内联脚本不能用外部文件替代）。
3. **主题色整条色阶由 JS 算好写 `<html>` inline style**（`--primary-50…700` 等）。不要用 CSS `color-mix()` 派生——做不了「对比度不达标继续调」的闭环；主色必须过 `domain/accent.resolveAccent`（白字 ≥4.5:1，坑位 #19）。
4. **语义色不跟随主题色**：环境色与新鲜度四态固定——跟着品牌色变会让「冷藏=蓝、临期=橙」失效。

### 6.5 FAB（快速入库）

右下角 FAB **只在库存 Tab 显示**（`v-if="isStock"`）。其他 Tab 必须隐藏。

### 6.6 ★ 弹框的返回键处理（重要模式）

**所有全屏/半屏弹框的开合状态必须用「路由 query 驱动」，禁止用局部 `ref`**（安卓返回键被 popstate 消费，局部 ref 会出现「页面跳走了弹框还开着」）：

```ts
const quickAddOpen = computed(() => route.query.quickadd === '1');
function openQuickAdd() { router.push({ path: '/stock', query: { quickadd: '1' } }); }
function closeQuickAdd() { if (route.query.quickadd) router.back(); }
```

弹框**内部**的跨页跳转必须用 `router.replace`（否则多一条历史记录，返回时弹框复现）。新增弹框照抄此模式并在 `src/components/README.md` 登记。

---

## 7. 环境准备

| 工具 | 版本 | 备注 |
| --- | --- | --- |
| Node.js | ≥ 20（推荐 22） | |
| npm | ≥ 10 | |
| JDK | **21** | 仅打 APK；Capacitor 8 不支持 JDK 17 |
| Android SDK | compileSdk / targetSdk 36，minSdk 24 | 仅打 APK |
| 签名（仅 release） | `android/keystore.properties` 或四个 `HOME_STEWARD_*` 环境变量 | 照 `keystore.properties.example` 建；**密钥与口令永远不入库**（坑位 #61） |

```bash
npm install
```

⚠️ `sharp` 装不上只影响图标生成，不影响构建。中文用户名路径下打 APK 的四个坑（镜像/代理/编码/路径检查）见坑位 #49~#52。

---

## 8. 常用命令与验证

| 命令 | 作用 |
| --- | --- |
| `npm run dev` | 开发服务器（默认 5173） |
| `npm run typecheck` | 类型检查（`vue-tsc --noEmit`） |
| `npm test` / `npm run test:watch` | 单元测试（vitest；当前 16 文件 / 253 例，覆盖 domain 全部纯函数 + sanitize） |
| `npm run build` | 生产构建 → `dist/`（含 PWA + Service Worker） |
| `npm run preview` | 预览构建产物（4173）——**验证 PWA/SW 行为必须用它**，dev 不注册 SW |
| `npm run icons` | 重新生成图标到 `public/icons/` |
| `npm run cap:add` / `cap:sync` / `cap:open` | 初始化 / 构建+同步 / 打开 Android 工程 |
| `npm run apk` / `apk:release` | 打 debug / release APK（`scripts/apk.mjs` 跨平台；release 缺签名会在构建前中止） |

### ⚠️ 提交前的三验（必做）

```bash
npm run typecheck && npm test && npm run build
```

`build` 成功**不保证**类型正确（Vite 不做全量类型检查），三条都要过。功能性/交互性改动（尤其路由、弹框、PWA）**必须**再跑 `npm run preview` 手点一遍，含**安卓返回键**行为。

### 测试约定（v3 起）

- 配置是**独立的 `vitest.config.ts`**（`environment: 'node'`，只注册 `@` 别名）：只测**纯函数**，不依赖 Vue / Dexie / 浏览器 API。
- 夹具统一放 `src/domain/__tests__/fixtures.ts`（`mkItem` / `mkLocation` / `mkShopping` / `TODAY` / `NOW` / `SETTINGS`），时间基准固定 `Date.UTC(2026, 9, 5)`，**不要用 `Date.now()`**。
- 新增领域函数 → 同步补 `src/domain/__tests__/*.test.ts`。
- ⚠️ 夹具里不要用 `s.category ?? 'vegetable'` 兜底（`??` 会吞掉显式 `null`，「无品类」路径永远测不到），用 `s.category === undefined ? 'vegetable' : s.category`。
- ⚠️ 用例挂了先怀疑**自己写的期望值**，别急着改产品代码（已两次把正确行为误判成 bug）；真 bug 用独立用例钉死，别顺手改断言。

---

## 9. 代码风格与命名约定

### TypeScript

- 严格模式；**不用 `any`**。确需时用 `unknown` 收窄，或 `as never` 适配已有签名并在注释里说明。
- 类型只从 `@/domain/types` 引入，禁止在 UI 层重复定义实体形状。
- 联合字面量类型优于 `enum`（序列化后是字符串，进 IndexedDB 更安全）。

### 命名

| 类别 | 规则 | 示例 |
| --- | --- | --- |
| Vue 组件文件 | PascalCase | `ItemGroupCard.vue` |
| domain / data 模块 | camelCase | `shelfLife.ts` |
| 导出函数 | 动词开头 camelCase | `computeExpiry` |
| 导出类型 | PascalCase | `Freshness` |
| 常量 | UPPER_SNAKE | `ENV_MAP`、`DISMISS_DAYS` |
| CSS 变量 | kebab-case 双横线 | `--color-page` |
| store id | camelCase | `'items'` |

### 组件导入：必须默认导入

`<script setup>` 只暴露 default 导出，具名导入构建时报 `[MISSING_EXPORT]`（坑位 #2）：

```ts
import ItemGroupCard from '@/components/ItemGroupCard.vue';      // ✅
import { ItemGroupCard } from '@/components/ItemGroupCard.vue';  // ❌ 构建失败
```

### 路径别名 / Vue 样式 / 注释 / Git

- 始终用 `@/` → `src/`，禁止 `../../` 跨模块边界。
- `<script setup lang="ts">`；样式全用 Tailwind 行内工具类，仅伪元素 / keyframes / 父选择器等场景才写 `<style scoped>`。每个 `.vue` 顶部一句话注释说明职责。
- 公共函数**必须**有 JSDoc（`@param` / `@returns` / 边界 / `@example`）；注释用简体中文，解释 **why** 而非 what。
- 提交信息用 Conventional Commits（`feat:` / `fix:` / `docs:` / `refactor:` / `perf:` / `test:` / `chore:`）；一个提交做一件事。

---

## 10. 已知坑位（速查）

**全表在 [`docs/PITFALLS.md`](docs/PITFALLS.md)（69 条，含原因与对策；新增坑位从 #70 起记入该文件）。** 这里只列最高频十条：

| # | 一句话 |
| --- | --- |
| 1 | TypeScript 锁 5.6.3，不升 TS 7（`vue-tsc` 会挂） |
| 2 | `.vue` 只能默认导入 |
| 3 | store 的 `computed`/`ref` 已解包，别写 `.value` |
| 6 | 原生壳必须跳过 SW 注册，否则 APK 缓存旧版本 |
| 13 | 不要注册静态 `/item/new`，让 `/item/:id` 匹配 |
| 14 | `vantCssLayer()` 插件与层序声明不能删，否则 Vant 全局规则压过工具类 |
| 18 | 深色变量只挂 `html[data-theme='dark']`，不用媒体查询 |
| 53 | 顶部安全区只用 `pt-[var(--safe-top)]`，Android WebView 里 `env()` 恒为 0 |
| 54 | 盘点队列必须是进入时快照，不 watch `props.rows` |
| 66 | dictKey 不能直接当折叠键，先过 `aliasKey` 再退 `normalizeName` |

其余高价值条目：脏备份三层防御（#33/#57/#58）、金额口径唯一（#46~#48）、扫码去重（#55）、`allowBackup=false`（#63）、输入字号 16px（#64）、NUL 转义（#65）、多标签同步（#67）、忽略抑制（#68）——见全表。

---

## 11. 常见改动场景导航

| 我想改… | 去这里 |
| --- | --- |
| 某个食材的保质期 | `src/data/dict/builtin.ts` |
| 某个环境的默认天数 | `src/domain/categories.ts`（`GLOBAL_DEFAULTS`） |
| 品类默认天数 / 关键词归类 | `src/domain/categories.ts`（`CATEGORY_DEFAULTS`、`KEYWORDS` **顺序敏感**） |
| 新鲜度阈值 / 颜色 | `src/domain/freshness.ts` + `src/styles/index.css` |
| 到期日算法 / 位置对比 | `src/domain/shelfLife.ts` |
| 购物清单自动生成规则 / 忽略抑制时长 | `src/domain/shoppingRules.ts`（`DISMISS_DAYS` 唯一定义） |
| 清单按位置分组顺序 | `src/domain/shoppingRules.ts`（`groupShoppingByLocation`） |
| 同名折叠 / FEFO / 入库真合并 | `src/domain/grouping.ts` |
| 库存列表分组顺序 | `src/domain/freshness.ts`（`groupByFreshness`；**折叠必须在此之前**，§5.6） |
| 时间轴分桶 | `src/domain/timeline.ts` |
| 统计口径 | `src/domain/stats.ts` |
| 备份导入的脏数据清洗 | `src/data/backup/sanitize.ts` |
| 设置归一（旧数据 / 导入） | `src/domain/settings.ts`（`normalizeSettings` **唯一**来源） |
| 金额口径（单价 / 本次金额） | `src/domain/price.ts`（**唯一定义**） |
| 换个数据库 | `src/data/index.ts`（一行）+ 新增 sources 实现 |
| 数据库表/索引 | `src/data/dexie/db.ts`（改后**必须**升 `SCHEMA_VERSION`；五处同步清单见 `src/data/README.md`） |
| 备份文件格式 | `src/data/backup/schema.ts`（改后**必须**升 `SCHEMA_VERSION`） |
| 顶部 Tab / FAB / 弹框返回键 | `src/layouts/TabLayout.vue` |
| 子页顶栏 / 标题 / 吸顶留白 | 路由写 `meta: { header: '标题' }` + `src/layouts/TabLayout.vue` + `src/components/NavBar.vue` |
| 顶部安全区 | `src/composables/useSafeArea.ts`（组件只写 `pt-[var(--safe-top)]`） |
| 跨零点 / 当前时间 | `src/composables/useNow.ts`（按天计算一律 `useToday()`） |
| 多标签数据同步 | `src/data/sync.ts`（BroadcastChannel） |
| 列表页搜索框 | `src/components/SearchField.vue` |
| 新增路由 | `src/router/index.ts`（懒加载；**不要**加静态 `/item/new`，坑位 #13） |
| 更新日志（面向用户） | `src/views/ChangelogView.vue`（发版在 ENTRIES 顶部追加条目，与 BATCHES 台账同步） |
| 主题色 / 间距 / 圆角 | `src/styles/index.css` |
| 提醒时间 / 通知方式 | `src/composables/useReminder.ts` |
| release 签名 / 打 APK | `scripts/apk.mjs` + `android/keystore.properties.example`（坑位 #61/#62） |
| Android 权限 / 备份策略 | `android/app/src/main/AndroidManifest.xml`（CAMERA 已声明；`allowBackup="false"`，坑位 #63） |
| appId / 包名 | `capacitor.config.ts` |

---

## 12. 提交前自检清单

- [ ] `npm run typecheck`、`npm test`、`npm run build` 三条全过
- [ ] UI/路由/弹框改动跑过 `npm run preview` 手点（含**安卓返回键**）
- [ ] 没有 `any`；没有违反分层（`domain/` 无 Dexie / Pinia / Vue / `data/`）；没有直接 import `data/dexie/db.ts`
- [ ] 消费外部数据的日期字段过了 `isDateStr`（§5.7）；按天计算用了 `useToday()`（§5.2）
- [ ] 改动列表主体组件时核对了旧组件的交互清单（长按多选等不能静默消失，坑位 #40）
- [ ] 新增/修改的公共函数有 JSDoc；新坑位已记入 `docs/PITFALLS.md`
- [ ] 新增/删除/重命名模块 → 更新了对应目录 `README.md`；对外接口/构建配置变更 → 更新了本文件
- [ ] 遗漏检查：没有引入网络请求、账号、云同步
- [ ] **完成批次 / 新增规划批次 → 已在 `docs/BATCHES.md` 登记**，明细文档已补落地记录
- [ ] Git 提交信息符合 Conventional Commits

---

## 13. 更多文档

| 文件 | 内容 |
| --- | --- |
| `docs/BATCHES.md` | ★ **批次台账**：完成/规划批次的唯一登记处 |
| `docs/PITFALLS.md` | ★ **坑位全表**（69 条）：坑 / 原因 / 对策 |
| `docs/ITERATION-REVIEW.md` | v1.0 迭代评审 + **批次 1~5 落地记录（§10~§14）** + **v1.1 功能规划（§15）** |
| `docs/V2-CHANGELOG.md` / `docs/V3-CHANGELOG.md` | v2 / v3 引入的新概念与坑（改对应代码前先看） |
| `docs/ARCHITECTURE.md` | 分层架构详解、数据流图、换存储实操 |
| `docs/DESIGN-REVIEW.md` | 无障碍与视觉层级评审（A/B/C 三批，已修） |
| `docs/ICON-TEXT-SPEC.md` | 图标 + 文本排版规范（动图标前先看） |
| `docs/使用教程.md` | 面向最终用户的操作教程 |
| `src/{domain,data,stores,composables,components,views,styles}/README.md` | 各层 API 与约定 |
| `README.md` | 产品简介、快速开始、GitHub 首页 |

---

**文档维护原则**：文档不是写给别人看的作业，是**未来的自己（或下一个 AI）不踩坑的唯一保险**。改了代码不改文档，等于给下一次改动埋雷。
