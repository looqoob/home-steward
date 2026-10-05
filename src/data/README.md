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
| `backup/import.ts` | 导入（replace / merge 两种模式） |

---

## repository.ts — 契约

```ts
interface Repository<T extends { id: string }> {
  all(): Promise<T[]>;              // 已自动过滤 soft-deleted
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

**行为**：若 `locations.all()` 已非空则**直接返回**（幂等，可安全重复调用）；否则批量写入 6 个预设位置，sort 为 10/20/…/60，`builtin: true`。

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
}

export function parseBackup(text: string): { ok: true; data: BackupFile } | { ok: false; message: string };
export async function importBackup(data: BackupFile, mode: ImportMode): Promise<ImportResult>;
```

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

## 新增实现 / 改接口的检查清单

- [ ] 改了 `repository.ts` 的签名 → 同步更新本 README 的契约表格
- [ ] 改了 Dexie 表/索引 → 升 version + 升 `SCHEMA_VERSION` + 补兼容读取
- [ ] 新增了内置食材 → 确认 `-1` 项都配了 `reason`
- [ ] 改了备份格式 → 升 `SCHEMA_VERSION` 并更新 `docs/ARCHITECTURE.md` 的数据流说明
- [ ] 同步更新了根 `AGENTS.md`（尤其是 §11 改动导航）
