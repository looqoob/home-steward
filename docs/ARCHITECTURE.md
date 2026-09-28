# 架构说明

> 面向需要改结构、加模块的人。日常改业务逻辑看 [../AGENTS.md](../AGENTS.md) 就够。

## 1. 为什么分层

家庭物资管家的核心复杂度在**规则**（保质期怎么算、新鲜度怎么判、建议怎么生成），而不是**界面**。
把规则抽成不依赖任何框架的纯函数层，带来三个好处：

1. **可测试**：`domain/` 能在 Node 里直接跑，不用 mock IndexedDB、不用 mock Pinia。
2. **可移植**：同一套规则将来要挪到 Capacitor SQLite、甚至后端，都不用重写。
3. **可推理**：规则集中在一处，不会散落在各个 `.vue` 里出现两份不一致的实现。

## 2. 四层职责与依赖方向

```
┌─────────────────────────────────────────────────────────┐
│  views / components / layouts                            │
│  职责：渲染、事件、路由。不做计算，不算日期。              │
├─────────────────────────────────────────────────────────┤
│  stores / composables                                    │
│  职责：持有响应式状态，编排「读数据 → 调规则 → 写数据」。  │
├─────────────────────────────────────────────────────────┤
│  domain                                                  │
│  职责：全部业务规则。纯函数，输入输出都是普通数据。        │
├─────────────────────────────────────────────────────────┤
│  data                                                    │
│  职责：持久化。抽象接口 + Dexie 实现，字典与备份。         │
└─────────────────────────────────────────────────────────┘

依赖只允许向下：views → stores → domain，data → domain
```

### 各层禁止事项

| 层 | 禁止 |
| --- | --- |
| `domain/` | ❌ import Dexie ❌ import Pinia ❌ import Vue ❌ import `data/`、`stores/` ❌ 读 `Date.now()` 以外的全局状态（`Math.random` 除外，见 `ids.ts`） |
| `data/` | ❌ import Pinia ❌ import Vue 组件 ❌ 业务逻辑（放 `domain/`） |
| `stores/` | ❌ import Vue 组件 ❌ 直接操作 Dexie |
| `views/` | ❌ 业务规则计算（一律调 store 或 domain） ❌ 直接 import `data/dexie/db.ts` |

**唯一允许绕过的场景**：`stores/items.ts` 为了拿到 resolver 调用 `sedict` / `locations` store —— 这是**跨 store 调用**，允许，因为都还在第 3 层。

## 3. 数据流

### 3.1 应用启动

```
App.vue onMounted
  └─ db.probe()                  检查 IndexedDB 是否可用
     ├─ false → 显示「无法使用本地存储」页（不再继续）
     └─ true  → ensureSeed(db)   首次启动写入 6 个预设位置（已存在则跳过）
                └─ Promise.all([settings.load(), dict.load(), locations.load(), items.load(), shopping.load()])
                └─ shopping.generate()   自动生成购物建议
                └─ reminder.refresh()    排本地通知 / Web 降级通知
```

### 3.2 新建一件商品

```
QuickAddSheet（选位置 + 输入名称）
  └─ items.add(NewItemInput)                          [stores/items.ts]
     ├─ lookupFood(name)?.category                    查内置字典拿品类
     ├─ locations.envOf(locationId)                   位置 → 环境
     ├─ createItem(input, env, dict.resolve, fallbackDays, now, category)   [domain/itemFactory.ts]
     │    └─ computeExpiry(input, env, resolver, fallback)                  [domain/shelfLife.ts]
     │         └─ resolver(name, env)                 [data/dict/index.ts]
     │              └─ resolveWith(custom, name, env)  四级兜底
     ├─ db.items.put(item)
     └─ load()                                        全量重读，刷新「 informs」所有 getter
```

> **为什么 `load()` 是全量重读？**
> 数据量级是「家庭」：几百件商品、几千条日志。全量重读换来的是**状态永远与存储一致**，省掉一整类「改了数据忘了同步 UI」的 bug。别为了微优化引入增量同步，除非实测出现性能问题。

### 3.3 新鲜度展示

```
StockView
  └─ items.active                                    过滤 in_stock && !deletedAt
     └─ item + freshnessOf(item, todayStr(), settings.settings)   [domain/freshness.ts]
        └─ sortByFreshness(rows)                      按 sortKey（剩余天数）升序
           └─ <ItemCard :item :freshness />           渲染进度条 + 状态标签
```

`today` 每次都重新计算 —— 跨零点时页面不一定自动刷新，这是已知行为，刷新页面即可。

## 4. 持久化抽象

### 4.1 抽象契约

`src/data/repository.ts` 定义了全部契约：

```ts
interface Repository<T extends { id: string }> {
  all(): Promise<T[]>;              // 已过滤软删除
  byId(id): Promise<T | undefined>; // 已过滤软删除
  put(entity): Promise<void>;       // upsert
  bulkPut(entities): Promise<void>;
  softDelete(id): Promise<void>;    // 置 deletedAt
  hardDelete(id): Promise<void>;    // 物理删除
  clear(): Promise<void>;
}

interface DataSources {
  items: ItemRepository;       // + byLocation()
  locations: LocationRepository; // + enabled()
  logs: LogRepository;         // + since(ts)
  shopping: ShoppingRepository;
  dict: DictRepository;        // + byKey()
  settings: SettingsRepository;  // 单例，get() 缺失时自动写默认
  transaction<T>(fn): Promise<T>;
  wipe(): Promise<void>;       // 清空全部业务数据（settings 除外）
  probe(): Promise<boolean>;   // 存储可用性探针 + 补写默认设置
}
```

**全部返回 Promise** —— 即使 Dexie 某些 API 是同步的。这是刻意为之：将来换成 SQLite 的异步插件 API 时，不必连锁重构调用方。

### 4.2 换存储实操

1. 新建 `src/data/sqlite/sources.ts`，实现 `DataSources`。
2. 改 `src/data/index.ts`：

```ts
export const db: DataSources = createSqliteSources();   // 只改这一行
```

3. `npm run typecheck` —— 编译期会告诉你漏实现了什么。
4. 业务代码**零改动**。

### 4.3 表结构与索引

见 [../src/data/README.md](../src/data/README.md)。改动表结构必须升 `SCHEMA_VERSION`（`src/domain/types.ts`）并在导入处做版本兼容。

## 5. 两套壳的差异

| 关注点 | PWA | Capacitor APK |
| --- | --- | --- |
| Service Worker | 注册（`registerSW`） | **不注册**（`main.ts` 用 `Capacitor.isNativePlatform()` 判断） |
| 资源来源 | HTTP + SW 缓存 | WebView 直接加载 assets 本地文件 |
| 临期通知 | `Notification` API（打开 App 时触发，不可靠定时） | `LocalNotifications.schedule`（真定时本地通知） |
| 文件下载导出 | `<a download>` 可用 | 部分 WebView 不支持，需走 Filesystem/Share |
| 容器 | `https://localhost`（Capacitor） | 原生 Activity |

**为什么原生壳绝对不能注册 SW**：WebView 加载本地资源时，SW 会缓存住第一次安装的版本，导致「明明改了代码、APK 重装了还是旧的」。这是个能在排查上烧掉半天的问题。

**为什么 schedule 不设 `exact`**：Android 12+ 的精确闹钟需要 `SCHEDULE_EXACT_ALARM` 特殊权限，普通 App 不应申请。本产品的通知精度是「明天早上告诉你该吃啥」，差几分钟无所谓。

## 6. 路由与弹框治理

### 路由表

| 路径 | 组件 | 说明 |
| --- | --- | --- |
| `/stock`（重定向自 `/`） | StockView | 库存主页，Tab 之一 |
| `/list` | ListView | 购物清单，Tab 之一 |
| `/me` | MeView | 我的 / 统计，Tab 之一 |
| `/item/new` | ItemEditView | 新建商品 |
| `/item/:id` | ItemEditView | 编辑商品 |
| `/locations` | LocationManageView | 位置管理 |
| `/dict` | DictView | 保质期字典 |
| `/settings` | SettingsView | 设置 |
| `/backup` | BackupView | 备份 |

前三个在 `TabLayout` 内部，其余是全屏子页（用 `NavBar`）。

### 弹框为什么用 query 驱动

安卓返回键触发 `popstate` → `router.back()`，这个事件**不会**通知任何局部 `ref`。如果用局部变量控制弹框：

```ts
const showSheet = ref(true);   // ❌ 返回键跳走了页面，showSheet 还是 true
```

改成 query 驱动后：

```
打开：router.push({ path: '/stock', query: { quickadd: '1' } })   // 压入一条历史记录
关闭：router.back()                                              // 只回退这条记录
```

结果：`path` 恒为 `/stock`，弹框关闭，**页面不跳**。

**配套约束**：弹框内部的跨页跳转（`QuickAddSheet` 里的「自定义」/「管理位置」）必须用 `router.replace`，否则会多压一条记录，返回时弹框会再次出现。

新增任何弹框都照抄 `TabLayout.vue` + `QuickAddSheet.vue` 的组合。

## 7. 半成品 / 已知限制

记录在这里，避免重复讨论：

1. **跨零点不自动刷新**：当天日期变化时 UI 不会自动重算新鲜度，需刷新页面。
2. **`store.load()` 全量重读**：当前数据量下无性能问题，量级上去了再优化。
3. **购物建议的 dedicated dismiss**：删除自动项只是「7 天内不再生成」，不是永久忽略。
4. **APK 尚未产出**：需要 JDK 21 + Android SDK 环境；PWA 路线已上线。
5. **`createdAt`/`updatedAt` 不统一**：`ConsumeLog` 只有 `createdAt`，写通用工具时注意。
