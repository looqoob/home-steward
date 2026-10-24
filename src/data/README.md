# data — 持久化层

> **职责**：把「怎么存」关在这里，让上层只关心「存什么」。
> 本层是纯粹的「读写通道 + 字典数据 + 备份格式」，**不放业务规则** —— 规则一律写进 `domain/`。

## 一句话：换数据库只改一行

```ts
// src/data/index.ts
export const db: DataSources = createDexieSources();   // ← 换成 createSqliteSources() 即可
```

业务代码**永远**写 `import { db } from '@/data'`，**永远不要**写 `import { dexieDb } from '@/data/dexie/db'`。

## 模块一览

| 文件 | 职责 |
| --- | --- |
| `repository.ts` | 抽象接口契约（`Repository` / `DataSources`）。改它们等于改所有实现的签名，务必同步更新本 README |
| `index.ts` | **选型唯一硬编码点**，导出 `db: DataSources` |
| `seed.ts` | 首次启动写入 6 个预设位置 |
| `dexie/db.ts` | Dexie 表定义与索引 |
| `dexie/sources.ts` | `DataSources` 的 Dexie 实现 |
| `dict/builtin.ts` | 内置食材字典（稀疏矩阵） |
| `dict/index.ts` | 四级兜底解析器 |
| `dict/normalize.ts` | 食材名归一化 |
| `backup/schema.ts` | 备份文件格式与校验 |
| `backup/export.ts` | 导出 JSON / 触发下载 / 复制剪贴板 |
| `backup/import.ts` | 导入（replace / merge 两种模式），**写库前先过 `sanitize`** |
| `backup/sanitize.ts` | **v3 新增**：记录级清洗（`sanitizeItems` / `Logs` / `Locations` / `Shopping` / **v1.0.1 增 `Dict`**） |

---

## repository.ts — 契约

```ts
interface Repository<T extends { id: string }> {
  all(): Promise<T[]>;              // 已自动过滤 soft-deleted
  allIncludingDeleted(): Promise<T[]>; // 不做任何过滤；「忽略抑制」与 merge 的 tombstone 比较都靠它
  countAll(): Promise<number>;      // 含软删除行；判「是否首次启动」只能用它
  byId(id: string): Promise<T | undefined>;
  put(entity: T): Promise<void>;    // upsert：存在则整条替换
  bulkPut(entities: T[]): Promise<void>;
  softDelete(id: string): Promise<void>;   // 置 deletedAt = Date.now()
  hardDelete(id: string): Promise<void>;   // 物理删除
  clear(): Promise<void>;
}
```

### 各 Repository 的扩展方法

| Repository | 扩展 | 说明 |
| --- | --- | --- |
| `LocationRepository` | `enabled()` | 未删除 && enabled，按 `sort` 升序 |
| `ItemRepository` | `byLocation(locationId)` | 该位置下未删除的商品（走 `locationId` 索引） |
| `LogRepository` | `since(ts)` | `at > ts` 且未删除（走 `at` 索引） |
| `DictRepository` | `byKey(dictKey)` | 该 dictKey 下未删除的条目（走 `dictKey` 索引） |
| `SettingsRepository` | `get()` / `save(s)` | 单例；`get()` 在记录缺失时**自动写入默认设置并返回**（绝不返回 undefined） |
| `BarcodeRepository`（v2） | `byCode(code)` | 按条码查未删除的映射。⚠️ `code` 必须原样传 **string**，条码有前导 0，转数字就匹配不上 |

### DataSources

```ts
interface DataSources {
  items / locations / logs / shopping / dict / settings / barcodes;
  transaction<T>(fn: () => Promise<T>): Promise<T>;  // 跨表事务
  wipe(): Promise<void>;      // 清空全部业务表（**不含 settings**）
  probe(): Promise<boolean>;  // 存储可用性探针 + 缺默认设置时补写
}
```

### 契约约束（实现新数据源时必须满足）

1. **全部方法返回 Promise** —— 即使底层 API 是同步的。目的是与 Capacitor SQLite 这类异步插件 API 对齐，避免将来连锁重构。
2. **`all()` / `byId()` 必须自动过滤 `deletedAt`** —— 调用方不应该到处写过滤。
   ⚠️ 正因如此，「这条记录从没存在过」和「用户把它删光了」在 `all()` 眼里一样：**判「是否首次启动」必须用 `countAll()`**（含软删除行），否则位置删光后会重播预设（坑位 #60，全表见 `docs/PITFALLS.md`）。
3. **`settings.get()` 永不 `undefined`** —— 缺失时补写 `DEFAULT_SETTINGS`。
4. **`wipe()` 不动 settings** —— 导入「覆盖」时要保留用户的提醒偏好。
5. **`probe()` 只读 + 补写，绝不覆盖已有设置** —— 它可能是用户在无痕模式下唯一的救命信息。

---

## dexie/db.ts — 表结构

数据库名 `home-steward`，**版本 2**（v2 新增 `barcodes` 表）。

| 表 | 主键 | 索引 | 说明 |
| --- | --- | --- | --- |
| `items` | `id` | `name, locationId, expireAt, status, deletedAt, updatedAt` | 商品 |
| `locations` | `id` | `sort, enabled, deletedAt` | 位置 |
| `logs` | `id` | `at, type, name, deletedAt` | 消耗/丢弃日志 |
| `shopping` | `id` | `checked, reason, deletedAt` | 购物清单 |
| `dict` | `id` | `dictKey, env, deletedAt` | 用户自定义字典 |
| `settings` | `id` | — | 单例，id 恒为 `'singleton'` |
| `barcodes` | `id` | `code, name, deletedAt` | **v2**：条码 → 名称的本地映射 |

`version(2).stores()` 只声明新增的表，Dexie 会自动把 v1 数据带上新表，**不需要 `upgrade()`**。

### ⚠️ 改表结构必须做五件事（v2 起）

1. `this.version(N).stores({...})` **递增版本号**（改索引也算）。
2. 升 `src/domain/types.ts` 的 `SCHEMA_VERSION`（备份格式随之演进）。
3. 在 `backup/import.ts` 里处理旧版本的兼容读取（新字段用 `?? []` 兜底）。
4. **`dexie/sources.ts` 的 `wipe()` 表清单加上新表** —— 漏了会导致「覆盖导入」后旧数据残留。
5. **`dexie/sources.ts` 的 `transaction()` 表清单加上新表** —— 漏了会导致事务里读不到新表。

> 第 4、5 条是 v2 踩过的坑：新增 `barcodes` 时最容易只改 `wipe()` 忘了 `transaction()`。

**不要对已有索引做破坏性变更**（删索引、改主键）而不写迁移逻辑 —— 用户本地已有真实数据，且**我们没有服务器兜底**，数据丢了就是真丢了。

---

## seed.ts

```ts
export const PRESET_LOCATIONS: Array<Pick<Location, 'name' | 'icon' | 'env'>>;
export async function ensureSeed(db: DataSources): Promise<void>;
```

**行为**：若 `locations.countAll() > 0` 则**直接返回**（幂等，可安全重复调用）；否则批量写入 6 个预设位置，sort 为 10/20/…/60，`builtin: true`。

> ⚠️ 判据必须是 `countAll()`（含软删除行），不能用 `all()`：`all()` 过滤掉了软删除，
> 用户把 6 个预设位置全删光后计数变 0，会被误判成「首次启动」而重播一遍（坑位 #60）。

**为什么用它**：用户第一次打开 App 时不应该面对空页面。`builtin: true` 标志着这是系统给的，将来做「恢复默认位置」时不误删用户自建的。

预设：冰箱冷藏(chilled) / 冰箱冷冻(frozen) / 常温储物(cool) / 米面柜(dry) / 蔬果篮(ventilated) / 阳台挂篮(ventilated)。

---

## dict/ — 保质期字典

### builtin.ts — 内置食材（稀疏矩阵）

```ts
interface BuiltinFood {
  key: string;                                     // 标准名，也是 dictKey
  aliases: string[];                               // 别名，参与匹配
  category: CategoryKey;
  envs: Partial<Record<EnvType, number>>;          // ★ 只写有把握的组合
  notRecommendedReason?: Partial<Record<EnvType, string>>;
}
export const BUILTIN_FOODS: BuiltinFood[];
```

内部用元组 `ROW = [key, category, envs, aliases?, reasons?]` 书写（省重复字段名），导出时展开成对象。**新增食材就往 `ROWS` 数组里加一行**。

**关键约定**

- **稀疏是特性，不是缺陷**：`西红柿 × 干燥` 没有值 —— 交给品类/全局兜底，比写一个瞎猜的数字好。
- `-1`（`NOT_RECOMMENDED`）表示「不宜放此环境」，**必须配 `reason`**（例如土豆冷藏：`'冷藏易发芽、口感变甜'`），否则用户只知道不能用却不知道为什么。
- 天数单位是**天**，≥365 时 UI 会自动转成「年」（见 `shelfLifeText`）。
- 别名参与 `byName` 匹配，所以番茄 / 圣女果都能命中「西红柿」。`key` 本身也会进 `byName`。

### normalize.ts

```ts
export function normalizeName(input: string): string;
export function firstChar(name: string): string;
```

`normalizeName` 依次做：`trim` → 全角 `！-～` 转半角 → 删除括号**及其内容** → 删除所有空白 → 转小写。

所以 `'番茄（西红柿）'`、`'西红柿'`、`' TOMATO '`、`'番茄(西红柿)'` 全部归一化为 `'tomato'`。

> 注意括号是被**连带内容删除**的：`'鸡蛋（散装）'` → `'鸡蛋'`。这是刻意的，让带修饰词的输入也能命中。

`firstChar` 用 `Array.from` 取首字符（正确处理 emoji / 代理对），空串返回 `'?'`。

### index.ts — 四级兜底解析

```ts
export function builtinIndex(): BuiltinIndex;    // { foods, byName }，首次调用后缓存
export function lookupFood(name: string): BuiltinFood | undefined;
export function categoryOf(name: string): CategoryKey | null;
export function buildCustomMap(entries: DictEntry[]): Map<string, DictEntry>;
export function resolveWith(custom, name, env): ResolveResult;
export function createResolver(custom): ShelfLifeResolver;
export function allBuiltinFoods(): BuiltinFood[];
export function shelfLifeText(days: ShelfLifeValue | null): string;
export { fallbackDays } from '@/domain/categories';
```

**`resolveWith` 的查询链**（返回时携带 `source`，UI 可显示「依据如下」）：

```
① custom  ：Map 键 `${normalizeName(dictKey)}|${env}`，用户自定义优先
② builtin ：内置食材 envs[env]（含 -1 不建议）
③ category：CATEGORY_DEFAULTS[品类][env]（> 0 才算命中）
④ global  ：GLOBAL_DEFAULTS[env]（> 0 才算命中）
⑤ none    ：{ days: null, source: 'none' } —— UI 提示手填
```

**边界条件**

- `builtinIndex()` 结果在**模块级缓存**，进程内之后不再更新。内置字典是静态数据，这没问题。
- `buildCustomMap` 跳过 `deletedAt` 的条目；同名同环境**后写的覆盖先写的**。
- `shelfLifeText`：`null` → `'未设置'`；`NOT_RECOMMENDED` → `'不建议'`；≥365 → `'1.5 年'`（保留一位小数）；否则 `'7 天'`。
- 自定义字典项若 `days === NOT_RECOMMENDED`，同样会走到 `resolveWith` 的 `-1` 分支。

**示例**

```ts
import { buildCustomMap, createResolver, resolveWith, shelfLifeText } from '@/data/dict';

const custom = buildCustomMap(dictEntries);
const resolve = createResolver(custom);

resolve('西红柿', 'chilled');   // { days: 7, source: 'builtin', reason: null }
resolve('土豆', 'chilled');     // { days: -1, source: 'builtin', reason: '冷藏易发芽、口感变甜' }
resolve('外星水果', 'dry');      // { days: 180, source: 'global', reason: null }

shelfLifeText(7);    // '7 天'
shelfLifeText(730);  // '2 年'
shelfLifeText(-1);   // '不建议'
shelfLifeText(null); // '未设置'
```

---

## backup/ — 备份与恢复

### schema.ts

```ts
interface BackupFile {
  app: 'home-steward';      // 应用标识，导入时校验
  version: number;          // 与 SCHEMA_VERSION 对齐（v2 起为 2）
  exportedAt: number;       // epoch ms
  items / locations / logs / shopping / dict: Array<...>;
  barcodes?: Array<BarcodeEntry>;  // v2 新增，**声明为可选**：v1 备份没这个键
  settings: Settings;
}
```

> `barcodes` 必须是**可选属性**。声明为必填的话，v1 备份在类型层面就说不通。
> 导入侧用 `?? []` 兜底。

```ts
export function emptyBackup(): BackupFile;
export function validateBackup(raw: unknown): { ok: boolean; message: string };
```

**校验策略：宽松**。只检查结构与关键字段，**不逐字段校验** —— 因为字典/实体的字段将来会扩展，严格校验会让旧备份无法导入。

> ⚠️ 「宽松」是针对**信封**而言。**记录级**校验由 `sanitize.ts` 在写库前完成（见下），
> 两者是互补的：schema 决定「这份文件能不能读」，sanitize 决定「读进来的记录能不能用」。

拒绝条件（返回的 message 可直接展示给用户）：

- 不是 JSON 对象 → `'文件内容不是有效的 JSON 对象'`
- `app !== 'home-steward'` → `'不是本应用的备份文件'`
- `version` 缺失 → `'备份文件缺少版本号'`
- `version > SCHEMA_VERSION` → `'备份版本 N 高于当前应用支持的 M'`（**未来备份拒绝导入**，不让降级数据被破坏）
- `items` / `locations` 不是数组 → `'备份文件缺少物品或位置数据'`

### export.ts

```ts
export async function buildBackup(): Promise<BackupFile>;
export function backupToJson(b: BackupFile): string;      // JSON.stringify(b, null, 2)
export function backupFileName(now?: number): string;     // home-steward-backup-YYYY-MM-DD.json
export function downloadJson(filename: string, json: string): boolean;
export async function copyToClipboard(text: string): Promise<boolean>;
```

**边界条件**

- `downloadJson` 用 `<a download>` + Blob URL，**部分 WebView 不支持**，返回 `false` 让 UI 提示改用「复制 JSON」。2 秒后 revoke URL 并移除节点。
- `copyToClipboard` 需要安全上下文（https 或 localhost）与用户手势，失败返回 `false`。
- **两者都捕获异常并返回布尔值，绝不抛出** —— UI 层据此降级。

### import.ts

```ts
export type ImportMode = 'replace' | 'merge';
export interface ImportResult {
  ok: boolean;
  message: string;
  counts?: { items; locations; logs; shopping; dict };   // 本次「进入」的条数
  /** v3：清洗结果，供 UI 如实告知用户丢弃/修正了多少条 */
  sanitized?: { dropped: number; fixed: number };
}

export function parseBackup(text: string): { ok: true; data: BackupFile } | { ok: false; message: string };
export async function importBackup(data: BackupFile, mode: ImportMode): Promise<ImportResult>;
```

> ⚠️ v3 起 `importBackup` 在**写库之前**对四张表分别调 `sanitize`（v1.0.1 起加第五张 `dict`，
> 见 `sanitizeDict`）；设置对象在 `save` 前过 `domain/settings.normalizeSettings`。
> 顺序不能反 —— 先写进去再清洗就来不及了，脏数据已经在 `bulkPut` 里了。

> ⚠️ **tombstone 参与合并（批次 4，REV-33）**：merge 模式读取现状用的是
> `allIncludingDeleted()`（含软删行）。只拿活行的话，本地删除的记录在旧备份里仍然存在、
> `updatedAt` 可能更新，会被原样写回 —— 用户删掉的东西随导入复活。本地 tombstone 的
> `updatedAt`（删除时刻）更新时同样压过备份行，删除意图得以保留。
> 位置排序重排也移进了**同一事务**：放在事务外会出现「数据已导入却返回 ok:false」，
> 且逐行刷新 `updatedAt` 会让本机位置永远「更新」、合并导入的位置改名进不来。

> ⚠️ **防空覆盖守卫（v1.0.1）**：备份里 `items` 原始条数 > 0、但清洗后为 0 时，
> `importBackup` 直接返回 `{ ok: false, message: …已中止导入，本机数据未改动 }`。
> 覆盖模式是「先 `wipe()` 再写入」，没有这道守卫时，一份信封合法但记录全坏的备份会把本机清空、
> 还报「已覆盖导入（物品 0 位置 0 日志 0）」。配套地，`BackupView` 在覆盖前把当前数据存成 JSON
> 快照，成功 toast 带「撤销覆盖」（仅本次会话有效）。

**两种模式**

| 模式 | 行为 |
| --- | --- |
| `replace` | 先 `db.wipe()`，再整批写入备份内容。**会删除本地现有数据**（settings 会被备份里的覆盖）。必须在 UI 上做强确认 |
| `merge` | 按 id 逐条合并，冲突取「更新时间较新」的一方 |

**合并规则（`mergeById`）**

- 键是 `id`。
- 时间戳取 `updatedAt ?? createdAt`（**`ConsumeLog` 没有 `updatedAt`，这里必须兼容**）。
- 新条目 `>=` 旧条目则覆盖（相等时后来者胜）。
- 导入结束后统一**重排 `locations.sort` 为 10/20/…**（在事务外做，避免与 `bulkPut` 冲突）。

**边界条件**

- 进入前会**过滤掉备份里已软删除的条目**（防止把对方的墓碑同步进来）。
- `replace` 模式下 `wipe()` 不删 settings，随后 `db.settings.save(data.settings)` 覆盖。
- 整个写入包在 `db.transaction` 里；失败返回 `{ ok: false, message: '导入失败：xxx' }`，**不抛出**。
- `counts` 统计的是**备份里进来多少条**，不是合并后总数。

**示例**

```ts
import { parseBackup } from '@/data/backup/import';
import { importBackup } from '@/data/backup/import';

const parsed = parseBackup(text);
if (!parsed.ok) return toast.show(parsed.message);

const res = await importBackup(parsed.data, 'merge');
toast.show(res.ok ? `${res.message}：${res.counts?.items} 件物品` : res.message);
await Promise.all([items.load(), locations.load()]);   // ★ 导入后必须刷新 stores
```

> **导入后必须重新 load 所有 store**，否则 UI 显示的还是旧内存状态。`BackupView.vue` 里有 `reloadStores()` 就是干这个的。

---

## sanitize.ts — **v3**：记录级清洗

### 为什么必须有它（这是 v3 修掉的一个严重问题）

`validateBackup` 只校验信封，**记录一条都不校验**就 `bulkPut` 进库。而备份文件是纯 JSON、
用户可以手改，也可能在传输中损坏。实测一条 `storedAt: 0` 就能让**「我的」「库存」双主 Tab
永久白屏**：

```
monthStats   → monthKey(0)      → (0).slice is not a function
freshnessOf  → diffDays(0, …)   → parseDate(0) → (0).split is not a function
```

而数据 100% 存本机、没有云端副本可回滚 —— 用户会发现自己既打不开应用、也换不回数据。

**所以清洗必须发生在导入这个唯一入口**，而不是等到各个消费端到处加 `typeof` 防御
（那样既漏又脏）。这是三层防御的第一层，另两层是 `dates.isDateStr` 与消费点的 `dateOf` 守卫。

### 接口

```ts
export interface SanitizeResult<T> {
  rows: T[];
  dropped: number;   // 整条丢弃（缺 id 或 name，无法在 UI 里呈现）
  fixed: number;     // 字段被修正过（数据还在，但值不合法）
}

export function sanitizeItems(input: unknown[], fallbackDate: string, now?: number): SanitizeResult<Item>;
export function sanitizeLogs(input: unknown[]): SanitizeResult<ConsumeLog>;
export function sanitizeLocations(input: unknown[], now?: number): SanitizeResult<Location>;
export function sanitizeShopping(input: unknown[], now?: number): SanitizeResult<ShoppingItem>;
// v1.0.1：自定义字典也进清洗（旧版漏了它 → 手改备份可让字典页永久白屏，坑位 #58）
export function sanitizeDict(input: unknown[], now?: number): SanitizeResult<DictEntry>;
```

> `now` 参数只是为了**可测试**（补时间戳/校验未来日期），业务调用不传，默认 `Date.now()`。

### 三条原则

| 原则 | 具体做法 |
| --- | --- |
| **能修的修** | 日期非法 → `storedAt` 替换成导入当天、`expireAt` / `producedAt` 置 `null`；数量非有限正数 → 归 1；`status` 非法 → `in_stock`；`type` 非法 → `consumed`；`env` / `reason` 非法 → 各自兜底值；**时间戳**（`createdAt` / `updatedAt` / `deletedAt`）非有限数 → 补 `now` / 置 `null` 并计 `fixed` |
| **修不了的丢** | 没有 `id` 或 `name`（非字符串 / 空串）的记录直接丢 —— 它在 UI 里无法呈现；**字典条目**的 `dictKey` 归一后为空、或 `days` 既不是正整数也不是 `-1` → 丢（不猜天数） |
| **绝不静默** | 计数随 `ImportResult.sanitized` 返回，由 `BackupView` 如实告知用户 |

> 为什么「能修就修」优先于「脏的就丢」：丢数据比显示错数据更糟 —— 用户宁可看到一个空日期，
> 也不愿自己的记录凭空消失。真正无法呈现的才丢。

### ⚠️ 为什么不直接 `JSON.parse` 后原样写入

- `locationId` / `unit` 被列表按字符串用，非字符串会在渲染时炸掉 → 强制兜底为 `''` / `'个'`；
- `sort` 非数字会让位置管理页排序错乱 → 归 `999`（排最后）；
- `ShoppingItem.locationId` 是脏值会让「按位置分组」（`groupShoppingByLocation`）把它塞进
  错误的位置桶。

### 为什么 `isDateStr` 住在 domain

`sanitize.ts` 从 `@/domain/dates` **转出** `isDateStr`，不自己实现一份。理由与
`normalizeName` 当初从 `data/dict/normalize.ts` 迁到 domain 完全一样：
**data 可以依赖 domain，反之不行。** `freshnessOf` 与 `stats` 也要用同一个守卫，
谁定义都不能有两份。

### 边界条件

- `sanitizeItems` **丢非法 `status`**：合并两种消耗状态会直接算错「在库」与浪费统计，
  宁可这条不进统计。
- `sanitizeLogs` 的 `at` 非法（非有限数或 ≤ 0）时补 `Date.now()` 并计 `fixed`。
- `sanitizeLocations` 只丢缺 `id` 的（位置没有 `name` 也能显示「未命名位置」）。
- `sanitizeShopping` 丢缺 `id` / `name` 的；`reason` 非法归 `'manual'`。
- `sanitizeDict`（v1.0.1）：`env` 非法回落 `cool`；`displayName` 缺失回落 `dictKey`；`dictKey` 过 `normalizeName`（变了计 `fixed`）；同 `${dictKey}|${env}` 保留最后一条（同时计 `dropped` 与 `fixed`）。
- 所有实体统一补 / 校验 `createdAt` / `updatedAt` / `deletedAt`：`deletedAt` 非有限数 → `null`（否则 `"deletedAt": "0"` 这种字符串为真，记录会进库后永久隐身，而计数报 `dropped:0 fixed:0`）。
- 输入是 `unknown[]`，所以对非对象元素（`null` / 数字 / 数组）也有分支，不会抛错。

### 配套的测试

`src/data/backup/__tests__/sanitize.test.ts`（45 例，含 `sanitizeDict` 与「软删除标记清洗」两组）。它虽然是 data 层测试，但仍然是
纯函数、node 环境，可以直接跑。`vitest.config.ts` 的 `include` 是 `src/**/*.test.ts`。

---

## 新增实现 / 改接口的检查清单

- [ ] 改了 `repository.ts` 的签名 → 同步更新本 README 的契约表格
- [ ] 改了 Dexie 表/索引 → 升 version + 升 `SCHEMA_VERSION` + 补兼容读取
- [ ] 新增了内置食材 → 确认 `-1` 项都配了 `reason`
- [ ] 改了备份格式 → 升 `SCHEMA_VERSION` 并更新 `docs/ARCHITECTURE.md` 的数据流说明
- [ ] **新增了 `BackupFile` 里的实体表 → `import.ts` 的 sanitize 调用与 `schema.ts` 的接口同步加**
- [ ] 同步更新了根 `AGENTS.md`（尤其是 §11 改动导航）
