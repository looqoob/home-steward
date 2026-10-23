# domain — 领域层（纯函数）

> **本层铁律**：不 import Dexie、不 import Pinia、不 import Vue、不 import `data/` 和 `stores/`。
> 输入输出都是普通数据，可以在 Node 里直接单元测试。
> 任何业务规则都应该住在这里，而不是散落在 `.vue` 文件里。

## 模块一览

| 文件 | 职责 |
| --- | --- |
| `types.ts` | 全部实体类型、枚举、常量（`ENV_MAP`、`DEFAULT_SETTINGS` 等）—— **字典/颜色的单一真源** |
| `dates.ts` | 本地日期字符串工具（`YYYY-MM-DD`）+ **`isDateStr` 合法性守卫** |
| `ids.ts` | ID 生成与稳定哈希 |
| `categories.ts` | 品类默认天数、关键词猜品类、全局兜底天数 |
| `freshness.ts` | 新鲜度状态机（核心概念） |
| `shelfLife.ts` | 保质期解析与到期日计算、多位置对比 |
| `itemFactory.ts` | 构造 / 更新 Item 对象 |
| `locationRules.ts` | 位置删除校验、计数、排序值 |
| `shoppingRules.ts` | 购物建议自动生成规则 · **v3**：清单按位置分组 |
| `stats.ts` | 月度统计、位置分布、今日概览 · **v3**：浪费趋势 / Top 浪费 / 周转天数 / 品类分布 |
| `accent.ts` | 主题色：预设色板、WCAG 对比度校正、色阶派生（纯数学，可 Node 单测） |
| `todo.ts` | **v2**：今日待办的构建、「明天再说」延后判断 |
| `inbound.ts` | **v2**：清单入库的数量/单位/位置默认值推断 |
| `bulk.ts` | **v2**：批量消耗/换位置/删除的规划（产出待写入的行，不碰数据库）。**v3**：`buildConsumeLog` 已导出为全项目唯一的日志构造实现 |
| `backup.ts` | **v2**：未备份提醒的档位与文案 |
| `normalize.ts` | **v2 新增**：名称归一化与首字图标。原先在 `data/dict/normalize.ts`，因本层铁律禁止 import `data/`，逻辑迁到这里，`data` 侧改为转出层 |
| `grouping.ts` | **v3 新增**：同名同位置折叠、FEFO 排序与分配、入库时真合并判据 |
| `timeline.ts` | **v3 新增**：到期日时间轴分桶（复用 `Freshness`，不重新解析日期） |
| `price.ts` | **v3 新增**：金额口径的唯一定义（`normalizePrice` / `priceFromInput` / `amountOf` / `round2`） |
| `settings.ts` | **v1.0.1 新增**：设置归一（`normalizeSettings`）—— 旧 IndexedDB 记录与备份导入共用的唯一校验入口 |

> v2 各模块的用法与坑位见 [`docs/V2-CHANGELOG.md`](../../docs/V2-CHANGELOG.md)；
> v3 见 [`docs/V3-CHANGELOG.md`](../../docs/V3-CHANGELOG.md)。

---

## types.ts

### 类型

| 类型 | 说明 |
| --- | --- |
| `EnvType` | `'chilled' \| 'frozen' \| 'cool' \| 'dry' \| 'ventilated' \| 'dark' \| 'none'`。环境**决定保质期**，与位置解耦 |
| `EnvGroup` | `'cold' \| 'frozen' \| 'normal'`，环境的粗分组 |
| `EnvMeta` | 环境的元信息：`{ key, label, fullLabel, group, dotClass, color }` |
| `CategoryKey` | 11 个品类键（vegetable / fruit / meat / seafood / eggMilk / soy / grainOil / dryGoods / seasoning / frozenFood / other） |
| `Location` | 位置。**注意：保存位置字段的是 `env`，不是天数** |
| `Item` | 商品。核心字段：`storedAt` / `producedAt` / `expireAt` / `shelfLifeDays` / `shelfLifeSource` / `manualShelfLife` / `notRecommended` |
| `ItemStatus` | `'in_stock' \| 'finished'` |
| `ShelfLifeSource` | `'custom' \| 'builtin' \| 'category' \| 'global' \| 'manual' \| 'none'` —— 到期日来源，用于 UI 显示「依据」 |
| `ConsumeLog` | 消耗/丢弃日志。**注意：没有 `updatedAt` 字段** |
| `ConsumeType` | `'consumed' \| 'wasted'` |
| `DictEntry` | 用户自定义字典条目 |
| `ShoppingItem` | 购物清单条目 |
| `ShopReason` | `'out_of_stock' \| 'near_expiry' \| 'frequent_waste' \| 'manual'` |
| `Settings` | 单例设置（id 恒为 `'singleton'`） |

### 常量

```ts
/** 哨兵值：该食材不宜放在此环境。字典/解析器用它表达「不建议」 */
export const NOT_RECOMMENDED = -1;
export type ShelfLifeValue = number | typeof NOT_RECOMMENDED;

/** 环境 → 元信息 映射。UI 里取文案/颜色一律从这里取，禁止硬编码 */
export const ENV_MAP: Record<EnvType, EnvMeta>;
export const ENV_LIST: EnvMeta[];                       // 有序列表，用于遍历渲染
export const CATEGORY_LABEL: Record<CategoryKey, string>;
export const DEFAULT_SETTINGS: Omit<Settings, 'createdAt' | 'updatedAt'>;

export const SCHEMA_VERSION = 1;                        // 备份文件格式版本
export const BUILTIN_DICT_VERSION = 1;
```

### ⚠️ 版本常量何时递增

- `SCHEMA_VERSION`：改了 `BackupFile` 结构、增/删实体必填字段、改 Dexie 表/索引时。
- `BUILTIN_DICT_VERSION`：批量修订内置字典值时（用于将来做「字典更新后重算所有商品」）。

### 示例

```ts
import { ENV_MAP } from '@/domain/types';

// ✅ 正确：从单一真源取
const label = ENV_MAP[loc.env].fullLabel;   // '冷藏 0–4℃'
const color = ENV_MAP[loc.env].color;       // '#4A8FD4'

// ❌ 错误：在 UI 里硬编码
const label = loc.env === 'chilled' ? '冷藏 0–4℃' : '常温阴凉';
```

---

## dates.ts

**所有日期一律用本地日期字符串 `'YYYY-MM-DD'`**，不含时刻、不含时区。目的是彻底避免跨时区和夏令时导致的「差一天」问题。

| 函数 | 签名 | 说明 |
| --- | --- | --- |
| `toDateStr` | `(d: Date) => string` | Date → `'YYYY-MM-DD'` |
| `todayStr` | `(now?: number) => string` | 今天的日期串。默认 `Date.now()`，传参便于测试 |
| `parseDate` | `(s: string) => Date` | `'YYYY-MM-DD'` → **本地零点**的 Date |
| `addDays` | `(s: string, n: number) => string` | 加 n 天（n 可为负） |
| `diffDays` | `(to: string, from: string) => number` | 自然日差，**`to - from`**。注意参数顺序！ |
| `formatMD` | `(s: string) => string` | `'2026-10-25'` → `'10-25'` |
| `monthKey` | `(s: string) => string` | `'2026-10-25'` → `'2026-10'` |
| `fromEpoch` | `(ms: number) => string` | epoch 毫秒 → 日期串 |
| `nextDailyAt` | `(hour: number, minute: number, now?: number) => number` | 下一个 `hour:minute` 的 epoch ms；若今天已过则返回明天 |
| `isDateStr` | `(v: unknown) => v is string` | **v3 新增**：`/^\d{4}-\d{2}-\d{2}$/` 格式守卫。⚠️ 外部数据（备份文件）进入日期计算前**必须**先过这一道 |

### 边界条件

- `addDays` 支持负数，跨月跨年自动处理（依赖 `Date.setDate` 的溢出进位）。
- `diffDays` 用 `Math.round` 消除夏令时造成的 ±1 小时误差。
- `parseDate` 对畸形输入不会抛错，会退化成 `1970-01-01` 附近的值 —— **调用方应保证传入格式正确**。
- `nextDailyAt` 的判定是 `<=`（今天同一时刻已过则取明天）。
- **⚠️ `parseDate` 不会抛错，但 `diffDays` / `monthKey` 里对非字符串调用 `.split` / `.slice` 会抛。**
  所以「防御要放在边界」而不是靠 `parseDate` 兜底：`freshnessOf` 与 `stats` 的每个
  日期消费点都先 `isDateStr(...)`，脏数据那一项直接当「无日期」跳过。
  `isDateStr` 住在 domain 而不是 `data/backup/sanitize`（data 可以依赖 domain，反之不行）——
  与 `normalizeName` 当初从 data 迁上来是同一回事。

### 示例

```ts
import { addDays, diffDays, isDateStr, todayStr } from '@/domain/dates';

const today = todayStr();                  // '2026-09-29'
const expire = addDays(today, 5);          // '2026-10-04'
diffDays(expire, today);                   // 5
diffDays(today, expire);                   // -5  ← 参数是 (to, from)
addDays('2026-12-31', 1);                  // '2027-01-01'

isDateStr('2026-10-04');                   // true
isDateStr(0);                              // false ← 备份文件里的脏值
```

---

## ids.ts

| 函数 | 签名 | 说明 |
| --- | --- | --- |
| `newId` | `() => string` | 生成全局唯一 ID。三级降级：`crypto.randomUUID()` → `crypto.getRandomValues()` → `Date.now()+Math.random()` |
| `hashId` | `(input: string) => number` | FNV-1a 32 位哈希取绝对值，把字符串 ID 稳定映射成整数（用于本地通知的 numeric id） |

### 边界条件

- `newId` 在**非安全上下文**（http 非 localhost）下 `crypto.randomUUID` 不可用，会自动降级，不会抛错。
- `hashId` **不是加密哈希**，且存在碰撞可能（`% 2147483647`）。用途仅为「同一个商品每次排通知拿到同一个 id」，碰撞时后写的通知会覆盖先写的 —— 对本项目可接受。

### 示例

```ts
import { hashId, newId } from '@/domain/ids';

const id = newId();              // 'a1b2c3d4-...'
const notifId = hashId(id);      // 1234567890
```

---

## categories.ts

| 导出 | 类型 | 说明 |
| --- | --- | --- |
| `CATEGORY_DEFAULTS` | `Record<CategoryKey, Partial<Record<EnvType, number>>>` | **第二级兜底**：字典没命中该环境时，按品类给默认天数 |
| `GLOBAL_DEFAULTS` | `Record<EnvType, number>` | **第三级兜底**：品类也没有时，按环境给天数。`none` 环境为 `-1` |
| `guessCategory` | `(name: string) => CategoryKey \| null` | 关键词猜品类。**按 `KEYWORDS` 数组顺序匹配，先命中先返回** |
| `fallbackDays` | `(env: EnvType, category: CategoryKey \| null) => number \| null` | 给「不建议存放」的保守建议天数。品类优先，无则全局；≤0 返回 `null` |

### 边界条件

- `KEYWORDS` 的**数组顺序就是优先级**（先命中先返回），编排理由是真实误判：
  `eggMilk` 必须在 `meat` 前（「土鸡蛋」「有机牛奶」含「鸡 / 牛」），`vegetable` 在 `fruit` 前（「黄瓜」「南瓜」含「瓜」），
  `frozenFood` 在 `grainOil` 前（「速冻饺子」含「饺」），`fruit` 在 `grainOil` 前（「牛油果」含「油」）。
  `meat` 不再收裸「牛 / 羊」，否则「牛油果」会被判成肉。改顺序必须跑 `__tests__/categories.test.ts` 的 27 条表驱动用例。
- `guessCategory` 是**子串匹配**（`name.includes(word)`），单字关键词（如 `'菜'` `'米'`）命中面很广，这是刻意的宽松策略 —— 猜错只影响兜底天数，用户可手填覆盖。
- `fallbackDays` 对 `env === 'none'` 返回 `null`（全局值是 `-1`，不满足 `> 0`）。

### 示例

```ts
import { fallbackDays, guessCategory } from '@/domain/categories';

guessCategory('西兰花');                 // 'vegetable'
guessCategory('某个没见过的东西');        // null
fallbackDays('chilled', 'vegetable');    // 5
fallbackDays('none', 'other');           // null
```

---

## freshness.ts

**本项目的核心概念。** UI 上的一切颜色、排序、文案都由这里的状态驱动。

| 导出 | 签名 | 说明 |
| --- | --- | --- |
| `FreshnessState` | 类型 | `'fresh' \| 'soon' \| 'urgent' \| 'over' \| 'warn' \| 'none'` |
| `Freshness` | 接口 | `{ state, label, remainDays, progress, sortKey }` |
| `freshnessOf` | `(item, today, settings) => Freshness` | 主函数，见下 |
| `barColor` | `(state) => string` | 状态 → 进度条颜色（CSS 变量字符串 `var(--state-*-bar)`） |
| `sortByFreshness` | `<T extends { sortKey: number; name: string }>(list: T[]) => T[]` | 按 sortKey 升序，同值按名称中文排序。**返回新数组，不改原数组** |
| `FreshGroup` | 类型 | 库存列表的四个展示分组：`'urgent' \| 'soon' \| 'fresh' \| 'none'` |
| `GROUP_LABEL` | `Record<FreshGroup, string>` | 分组 → 中文标题（紧急待吃 / 临期 / 新鲜 / 未设保质期） |
| `GROUP_ORDER` | `FreshGroup[]` | 分组展示顺序，最需要处理的最前 |
| `groupOf` | `(state: FreshnessState) => FreshGroup` | 六态 → 四组；`over` 并入 `urgent`，`warn` 并入 `none` |
| `groupByFreshness` | `<T extends { state: FreshnessState }>(list: T[]) => FreshGroupBundle<T>[]` | 把已排序列表切成带分组头的段落，**空组自动跳过** |

### `freshnessOf(item, today, settings)`

**参数**

- `item: Item`
- `today: string` — `'YYYY-MM-DD'`，通常是 `todayStr()`
- `settings: Pick<Settings, 'soonDays' | 'urgentDays'>`

**返回值**

- `state` — 见 §状态判定
- `label` — 直接给 UI 用的中文短句（`'剩 3 天'` / `'已过期 2 天'` / `'不建议存放'` / `'未设保质期'`）
- `remainDays` — 剩余天数，过期为负；无到期日为 `null`
- `progress` — `[0.04, 1]` 区间内的浮点；**无到期日时为 `null`**
- `sortKey` — 数值，越小越靠前

**状态判定顺序**

```
item.expireAt 经 isDateStr 校验不通过（缺失 / null / 'abc' 这类脏值）→
    notRecommended ? 'warn' (sortKey = 1e9-1) : 'none' (sortKey = 1e9)

否则 d = diffDays(expireAt, today)：
    d < 0                    → 'over'   「已过期 N 天」
    0 ≤ d ≤ urgentDays       → 'urgent' 「剩 N 天」
    urgentDays < d ≤ soonDays→ 'soon'   「剩 N 天」
    d > soonDays             → 'fresh'  「剩 N 天」
```

> ⚠️ v3 起判定条件从 `!item.expireAt` 改成 `!isDateStr(item.expireAt)`。
> 脏数据 `expireAt: 'abc'` 是真值，会穿透到 `diffDays` → `parseDate` → `'.abc'.split` 抛错，
> 把「库存」「我的」两个主 Tab 打成白屏。**改这个模块时不要退回真值判断。**

**边界条件**

- `progress` 的分母优先取 `item.shelfLifeDays`（>0 时），否则退化为 `max(d, 1)`。
- `progress` 被 `clamp` 到 `[0.04, 1]`：**过期固定显示 0.04**，保证进度条永远不完全消失（原型视觉要求）。
- `barColor` 对 `'warn'` 和 `'none'` 走 `default` 分支（同 `over` 样式）。UI 一般不显示它们的进度条。
- 徽章的**背景/前景配色**不再经由本模块（旧 `badgeClass` 已删除），改由 `ItemCard.vue` 的 `badgeColor` 映射（Tailwind 工具类 `bg-*-bg` / `text-*-fg`）负责。

**示例**

```ts
import { freshnessOf, sortByFreshness } from '@/domain/freshness';
import { todayStr } from '@/domain/dates';

const today = todayStr();
const rows = items.active.map((i) => ({
  item: i,
  ...freshnessOf(i, today, { soonDays: 14, urgentDays: 3 }),
}));
const sorted = sortByFreshness(rows);   // 快过期的排最前
```

### 列表分组（`groupByFreshness`）

六态 `FreshnessState` 对 UI 来说太细，列表展示用四组就够，映射关系：

| FreshnessState | FreshGroup | 说明 |
| --- | --- | --- |
| `over` | `urgent` | 已过期比临期更急，排在该组最前（sortKey 为负） |
| `urgent` | `urgent` | 紧急待吃 |
| `soon` | `soon` | 临期 |
| `fresh` | `fresh` | 新鲜 |
| `warn` | `none` | 不建议存放 —— 没有到期日，与「未设保质期」同组 |
| `none` | `none` | 未设保质期 |

**边界条件**

- 传入的列表**必须已经排好序**：`groupByFreshness` 只做分桶，不排序，组内顺序即传入顺序。
- 空组不会出现（内部 `filter` 掉了），调用方无需再判空。
- 返回的组顺序固定为 `GROUP_ORDER`，与传入顺序无关。

```ts
import { groupByFreshness, freshnessOf, sortByFreshness } from '@/domain/freshness';

const rows = sortByFreshness(
  items.active.map((i) => ({ item: i, ...freshnessOf(i, today, settings) })),
).map((r) => ({ ...r, state: r.state }));

groupByFreshness(rows);
// → [{ group: 'urgent', label: '紧急待吃', items: [...] },
//    { group: 'fresh',  label: '新鲜',     items: [...] }]
```

---

## shelfLife.ts

| 导出 | 签名 | 说明 |
| --- | --- | --- |
| `ResolveResult` | 接口 | `{ days, source, reason }`；`days` 可能为 `-1`（不建议）或 `null`（查不到） |
| `ShelfLifeResolver` | 类型 | `(name: string, env: EnvType) => ResolveResult`。**由数据层注入**，domain 不直接查库 |
| `ExpiryInput` | 接口 | `{ name, category, storedAt, producedAt?, manualShelfLife? }` |
| `ExpiryResult` | 接口 | `{ expireAt, days, source, notRecommended, reason, fallbackDays }` |
| `computeExpiry` | `(input, env, resolver, fallback) => ExpiryResult` | 主函数，见下 |
| `CompareRow` | 接口 | 多位置对比表的一行 |
| `compareLocations` | `(input, locations, resolver, fallback) => CompareRow[]` | 列出每个候选位置下的到期日 |

### `computeExpiry(input, env, resolve, fallback)`

**优先级（从高到低）**

1. `env === 'none'` → 直接返回 `{ expireAt: null, source: 'none', ... }`
2. `manualShelfLife > 0` → 用它算，`source: 'manual'`，**不受环境影响**
3. `resolve(name, env)` 命中：
   - `days === NOT_RECOMMENDED(-1)` → `expireAt: null`、`notRecommended: true`，并把 `fallback(env, category)` 放进 `fallbackDays` 供 UI 提示「若坚持存放」
   - `days > 0` → 正常计算
   - `days === null 或 ≤ 0` → `expireAt: null`，`source` 沿用 resolver 给的
4. 基准日 `base = producedAt || storedAt`（有生产日期优先）

**边界条件**

- 天数一律 `Math.round` 取整。
- **`manualShelfLife` 优先级最高且切位置不覆盖** —— 这是刻意的：用户手填说明他掌握了更准确的信息。
- 「不建议」时 `expireAt` 为 `null`，因此后续 `freshnessOf` 会返回 `warn` 状态。
- 传入的 `Fallback` 必须能处理 `env === 'none'`（返回 `null` 即可）。

**示例**

```ts
import { computeExpiry, compareLocations } from '@/domain/shelfLife';
import { fallbackDays } from '@/domain/categories';

const r = computeExpiry(
  { name: '西红柿', category: 'vegetable', storedAt: '2026-09-29' },
  'chilled',
  dict.resolve,
  fallbackDays,
);
// r = { expireAt: '2026-10-04', days: 5, source: 'builtin', notRecommended: false, ... }

// 香蕉放冷藏 → 不建议
const b = computeExpiry({ name: '香蕉', category: 'fruit', storedAt: '2026-09-29' }, 'chilled', dict.resolve, fallbackDays);
// b = { expireAt: null, notRecommended: true, reason: '...', fallbackDays: 7, ... }
```

---

## itemFactory.ts

| 导出 | 签名 | 说明 |
| --- | --- | --- |
| `NewItemInput` | 接口 | 新建商品的用户输入：`{ name, quantity, unit, locationId, price?, storedAt?, producedAt?, manualShelfLife?, note? }` |
| `createItem` | `(input, env, resolve, fallback?, now?, categoryHint?) => Item` | 构造完整 Item（含 id、时间戳、到期日） |
| `recomputeForLocation` | `(item, env, resolve, fallback) => Pick<Item, 'expireAt' \| 'shelfLifeDays' \| 'shelfLifeSource' \| 'notRecommended' \| 'notRecommendedReason'>` | 切换位置后重算，**入库日期不变** |
| `applyManualShelfLife` | `(item, days, resolve, fallback, env) => Item` | 变更手填保质期并返回新 Item |
| `locationEnv` | `(loc?: Location) => EnvType` | 取位置环境，缺省 `'cool'` |

### 边界条件

- `createItem` 会 `name.trim()`，`icon` 取**第一个 Unicode 字符**（用 `Array.from` 正确处理 emoji / 代理对），空名取 `'?'`。
- `categoryHint` 优先于 `guessCategory`：store 层会从内置字典查到更准的品类后传进来。
- `storedAt` 缺省为今天（由 `now` 决定）。
- `applyManualShelfLife`：`days <= 0` 会被归一化成 `null`（即关闭手填）。
- **`price` 走 `normalizePrice`**：这是所有物品的**唯一诞生点**，负数 / `NaN` / `Infinity` /
  字符串（备份导入）一律落成 `null`，绝不让脏值进库。口径见 [`price.ts`](#pricets--v3金额口径的唯一定义)。
- 这几个函数**不落库**，只产出对象；持久化由 store 层负责。

**示例**

```ts
import { createItem, recomputeForLocation } from '@/domain/itemFactory';
import { fallbackDays } from '@/domain/categories';

const item = createItem(
  { name: '牛奶', quantity: 2, unit: '盒', locationId: loc.id, price: 12.5 },
  'chilled',
  dict.resolve,
  fallbackDays,
);

// 挪到常温储物（cool）
const patch = recomputeForLocation(item, 'cool', dict.resolve, fallbackDays);
await items.save({ ...item, ...patch, locationId: otherLocId });
```

---

## locationRules.ts

| 导出 | 签名 | 说明 |
| --- | --- | --- |
| `DeleteCheck` | 接口 | `{ ok: boolean; message: string }` |
| `canDeleteLocation` | `(loc, items) => DeleteCheck` | **有在库物品不允许删除**（只能停用）。返回可直接展示给用户的 message |
| `countInLocation` | `(locId, items) => number` | 统计某位置的在库数量（过滤 `finished` 与软删） |
| `nextSort` | `(locations) => number` | 新位置的排序值 = 当前最大值 + 10 |

### 边界条件

- `canDeleteLocation` 的判定：同位置 && `status === 'in_stock'` && `!deletedAt`。已用完（`finished`）的不算。
- `nextSort` 在空数组时返回 `10`（reduce 初值 0）。
- **` locations.sort` 步长故意留 10 的空隙**，方便将来做「移动到某两项之间」而不用重排全部。

**示例**

```ts
import { canDeleteLocation, nextSort } from '@/domain/locationRules';

const check = canDeleteLocation(loc, items.list);
if (!check.ok) toast.show(check.message);   // '该位置还有 3 件在库物品，请先移出或停用'
```

---

## shoppingRules.ts

| 导出 | 签名 | 说明 |
| --- | --- | --- |
| `Suggestion` | 接口 | `{ name, reason, why, sourceItemId, locationId, unit }` |
| `planShopping` | `(items, logs, existing, now?, settings?) => Suggestion[]` | 生成购物建议，**幂等** |
| `REASON_LABEL` | `Record<ShopReason, string>` | 原因 → 中文标签 |
| `ShopLocationGroup` | 接口 | **v3**：`{ locationId: string \| null, label, items }` |
| `NO_LOCATION` | `const` | **v3**：「未指定位置」组的内部键 |
| `groupShoppingByLocation` | `(list, locations) => ShopLocationGroup[]` | **v3**：清单按存放位置分组 |

### 三条规则

| # | 原因 | 触发条件 |
| --- | --- | --- |
| ① | `out_of_stock`（库存 0） | 近 **60 天**有 `consumed` 日志，但当前无同名在库商品 |
| ② | `near_expiry`（临期替换） | 当前在库且新鲜度为 `urgent` 或 `over` |
| ③ | `frequent_waste`（易浪费） | 近 **90 天** `wasted` 日志 ≥ 2 次 → 「建议少买」 |

### 幂等性（重要）

- 同一 `name | reason` 在一次调用内只产出一次（`seen` 去重）。
- 已存在未删除的同 key 条目 → 跳过。
- 已删除**但** `dismissedUntil > now` 的同 key 条目 → 跳过（`DISMISS_DAYS = 7` 天内不重生）。

所以**反复调用 `planShopping` 不会产生重复项**，可以在 App 启动时安全调用。

### 边界条件

- `settings` 缺省 `{ soonDays: 14, urgentDays: 3 }`。
- 「无同名在库」的判断用的是**精确名称匹配**（字符串相等），不做归一化 —— 别名不同会当成两种东西，这是已知简化。
- 该模块**不写库**，只返回建议；由 `stores/shopping.ts` 负责落库。

**示例**

```ts
import { planShopping, REASON_LABEL } from '@/domain/shoppingRules';

const suggestions = planShopping(items.list, items.logs, shopping.list, Date.now(), settings.settings);
suggestions.forEach((s) => console.log(s.name, REASON_LABEL[s.reason], s.why));
```

### 按位置分组（v3）

购物时是**按逛店动线**走的：先挑要放冷藏的，再挑放干燥的。所以分组顺序**跟随
「位置管理」里的顺序**（`locations` 已按 `sort` 排好），而不是按清单项的原因。

- 「未指定位置」永远排最后 —— 它是「还没决定放哪」，不该抢在真实位置前面。
- **已停用 / 已删除的位置不单独成组**，其中的项归入「未指定」：位置管理里已经把它
  藏起来了，清单里再单列一组只会让用户去找一个找不到的柜子。
- 按位置分组时，`reason` 降为副标签（信息还在，只是让位给位置）。
- `@param locations` 需已按 `sort` 升序；`@param list` 调用方先过滤 `deletedAt`。

```ts
import { groupShoppingByLocation } from '@/domain/shoppingRules';

groupShoppingByLocation(shopping.visible, locations.all);
// → [{ locationId: 'L1', label: '冰箱冷藏', items: [...] },
//    { locationId: null,  label: '未指定位置', items: [...] }]
```

---

## stats.ts

| 导出 | 签名 | 说明 |
| --- | --- | --- |
| `MonthStats` | 接口 | `{ inbound, consumed, wastedCount, wastedAmount }` |
| `monthStats` | `(items, logs, now?) => MonthStats` | 本月入库件数 / 消耗与浪费**数量**（累加日志 `quantity`）/ 浪费金额 |
| `LocationSlice` | 接口 | `{ locationId, name, count, color, percent }` |
| `locationDistribution` | `(items, locations, colorOf) => LocationSlice[]` | 位置分布（`count > 0` 才返回，按数量降序） |
| `TodayOverview` | 接口 | `{ dueToday, overdue }` |
| `todayOverview` | `(items, today, urgentDays) => TodayOverview` | 今日待吃（紧急+过期）/ 已过期数量 |
| `MIN_TREND_MONTHS` | `const = 2` | **v3**：趋势图最少有数据的月份数 |
| `MIN_TURNOVER_SAMPLES` | `const = 5` | **v3**：周转天数最少样本数 |
| `WastePoint` / `wasteTrend` | `(logs, months?, now?) => WastePoint[]` | **v3**：近 N 月浪费趋势（金额 + 数量） |
| `WastedTop` / `topWasted` | `(logs, n?) => WastedTop[]` | **v3**：最常浪费 Top N |
| `turnoverDays` | `(items, logs) => number \| null` | **v3**：平均周转天数 |
| `CategorySlice` / `categoryDistribution` | `(items) => CategorySlice[]` | **v3**：在库品类分布 |
| `StockValue` / `stockValue` | `(items, today?) => StockValue` | **v3**：在库物资总价值（**含已过期**，过期金额单独给出）|

### v3 的「数据不足」原则

`wasteTrend` 与 `turnoverDays` 达不到样本下限时返回**空数组 / `null`**，由页面显示
「数据不足」。宁可什么都不说，也不要给一个自己会信的假结论 —— 统计页是帮人做决策的，
凭 1 个样本算出的「周转 3 天」会直接误导。

边界条件（v3 新增部分）：

- `wasteTrend` 金额累加 `ConsumeLog.price`（**本次金额**，不是单价），空月份补 0 ——
  折线要连续，缺月会被画成「从 3 月直连 6 月」的假象；只统计 `type === 'wasted'`。
- `topWasted` 按**累计浪费金额**降序；金额全为 0（用户没填价格）时退化为按数量排，
  仍然返回一个有用的顺序，比「因为都是 0 所以随机排」好。
- `turnoverDays` 按 `itemId` 取**第一次** `consumed` 的 `at`：20 个鸡蛋分 4 次吃完，
  用第 4 次算出来的是「消耗周期」不是「周转速度」。入库日晚于消耗日（补录）的样本跳过。
- ★ `stockValue` **过期计入**（还没扔，钱已经花了，它就是还在），但 `overAmount` 单独返回，
  由界面标注「含已过期 ¥N」——混在总数里会让人高估还能用的物资。
  金额 = `amountOf(price, quantity)`（单价 × 数量）；没填价的**不计入金额**而是计入 `unpriced`，
  因为计 0 会让总数看起来是覆盖全量的真实值。
- `categoryDistribution` 把 `category === null` 归到「其他」—— 自定义食材没有品类，
  但不能因此从统计里消失（否则各项占比加起来 ≠ 100%）。
- ⚠️ 本模块所有按日期聚合的函数都有 `dateOf()` 私有守卫，脏日期一律跳过。
  **新增同类函数时照抄这个守卫**，别等某个 `storedAt: 0` 把主 Tab 打成白屏。

### 边界条件（原有）

- `monthStats` 的「本月」按传入 `now` 的月份判定；日志按 `at` 字段判定（不是 `createdAt`）。
- `monthStats` 统计入库时**包含**已用完（`finished`）的商品。
- `wastedAmount` 累加 `l.price ?? 0`。日志里的 `price` 已是**本次金额**（`单价 × 本次数量`，由 `buildConsumeLog` 折算），没填价格的不报错、计 0。
- `consumed` / `wastedCount` 是**数量口径**（累加 `l.quantity`）：吃掉 2 个鸡蛋记 2，而不是一次操作记 1 件。跨单位（个/袋/盒）直接相加是本实现的粗略口径，改统计语义时注意。
- `locationDistribution` 的分母 `total = live.length || 1`，所以**库存为空时 percent 全为 0 而不是 NaN**；但因为过滤了 `count > 0`，此时返回空数组。
- `todayOverview` 只统计有 `expireAt` 的在库商品。

**示例**

```ts
import { locationDistribution, monthStats, todayOverview, topWasted, turnoverDays, wasteTrend } from '@/domain/stats';
import { ENV_MAP } from '@/domain/types';

const m = monthStats(items.list, items.logs);
const trend = wasteTrend(items.logs, 6);                // [] = 数据不足
const top = topWasted(items.logs, 5);
const turnover = turnoverDays(items.list, items.logs);  // null = 数据不足
const slices = locationDistribution(items.list, locations.all, (env) => ENV_MAP[env].color);
const today = todayOverview(items.list, todayStr(), 3);
const value = stockValue(items.list, todayStr());  // { total, overAmount, priced, unpriced }
```

---

## grouping.ts — **v3**：同名折叠与 FEFO

### ★ 核心立场：数据层永不合并

两份牛奶，10-08 与 10-15 到期。合并成一行就必然要丢掉「哪一份先过期」，而这恰恰是
避免浪费的唯一依据：取最近 → 10-15 那份被提前判过期、你会扔掉还能喝的；取最早 →
10-08 那份被「续命」、该扔的时候 App 不提醒。

所以本模块的分工是固定的：

| 层 | 做法 |
| --- | --- |
| **数据层** | 一条记录 = 一个批次，**永不合并** |
| **展示层** | 同名同位置折叠成一张组卡（`ItemGroupCard.vue`） |
| **消耗层** | 按 **FEFO**（First Expired First Out，最早到期先出）选份 |
| **入库层** | 到期日相差 ≤ 1 天时才真合并（`findMergeTarget`）——那种情况折叠与合并对用户完全无感 |

### 导出

| 导出 | 签名 | 说明 |
| --- | --- | --- |
| `ItemGroup` | 接口 | `{ key, name, icon, unit, locationId, members, lead, totalQuantity, allDated }` |
| `foldKeyOf` | `(item, aliasKey?) => string` | 折叠键 = `` `${locationId}|${名称键}` `` |
| `fefoCompare` / `sortFefo` | `(a, b) => number` / `(items) => Item[]` | 到期日升序，无到期日排最后；同天按 `createdAt` 升序 |
| `foldItems` | `(items, aliasKey?) => ItemGroup[]` | 主入口：过滤已用完/已删 → 分桶 → 组内 FEFO → 组间按 `lead` 排序 |
| `FefoSlice` / `fefoSlices` | `(members, qty) => FefoSlice[]` | 把 `qty` 按 FEFO 拆到各份上，可跨份顺延 |
| `GroupConsumePlan` / `planGroupConsume` | `(members, qty, type, now?) => { logs, items }` | 组消耗规划，语义与 `planBulkConsume` 一致 |
| `expiryCompatible` | `(a, b) => boolean` | 两份能否**无损**合并（都无日期，或相差 ≤ 1 天） |
| `findMergeTarget` | `(created, items, aliasKey?) => Item \| undefined` | 入库时找可合并的既有行；找不到是**正常路径** |

### 折叠键必须带位置

```ts
const nameKey = item.dictKey ?? aliasKey?.(item.name) ?? normalizeName(item.name);
return `${item.locationId}|${nameKey}`;
```

- **带位置**：冰箱里的和阳台上的同名物品是两回事，并成一张卡会让用户在错误的柜子里找东西。
- **名称键三级回退**：`item.dictKey`（入库时定格，之后字典改名也不会漂移）→ 实时解析字典别名
  （番茄 = 西红柿）→ 纯字面归一（自定义食材没有字典条目）。`aliasKey` 由调用方注入
  `data/dict` 的 `foodKeyOf`，与 `ShelfLifeResolver` 同一套路：**domain 不得反向依赖 data**。

### 三个必须遵守的口径

1. **组卡的状态色 / 排序 / 进度条一律取 `lead`（`members[0]`，组内最早到期那份）**。
   混用会出现「名字是西红柿、颜色按番茄」这种用户看不懂的结果。
2. **待办 / 提醒 / 统计一律按「份」，只有库存列表按组折叠。** 折叠是展示层的事，
   业务口径不能跟着折叠 —— 否则「3 盒牛奶」会变成「1 件牛奶」。
3. **折叠必须在分段之前**：先 `foldItems` 得到 `foldedRows`，再交给
   `groupByFreshness` / `groupByTimeline` 分段。反过来做会把同名组切到两段，
   同一物品在两处重复出现 —— 这是最不能接受的错。

### FEFO 排序

```
expireAt 升序（null 排最后）→ 同一天则 createdAt 升序（先进先出）
```

展开后第一行就是「下一份该吃的」，用户核对起来是自上而下的。

### 边界条件

- `foldItems` **只收 `in_stock` 且未软删的**；`finished` 的成员不该出现在组里。
- `fefoSlices` 数量不足时**只分配到有的为止**（`take` 合计可能小于 `qty`），
  调用方要按实际返回值写日志，不要假设分满了。
- `planGroupConsume` 里某份被取完 → `status = 'finished'` 且 **`quantity` 保留原值**
  （供日志对账、撤销时回加）；只取一部分 → 扣 `quantity`、状态仍为 `in_stock`。
- `expiryCompatible` 把「差 1 天」算作同一天：日期是用户手填的，`10-08` 与 `10-09`
  在实际场景里就是同一批；差 3 天就该让用户自己看清两行。
- `foldItems` 排序里加了名称兜底，否则每次 `load()` 卡片会跳位。

### 示例

```ts
import { foldItems, fefoSlices } from '@/domain/grouping';
import { foodKeyOf } from '@/data/dict';

const groups = foldItems(items.active, foodKeyOf);
// groups[0] = { name: '牛奶', members: [10-08 那份, 10-15 那份], lead: 10-08 那份, … }

fefoSlices(groups[0].members, 3);
// → [{ item: 10-08 那份, take: 1 }, { item: 10-15 那份, take: 2 }]  跨份顺延
```

---

## timeline.ts — **v3**：时间轴分桶

| 导出 | 签名 | 说明 |
| --- | --- | --- |
| `TimeBucket` | 类型 | `'over' \| 'today' \| 'tomorrow' \| 'week' \| 'later' \| 'none'` |
| `BUCKET_LABEL` | `Record<TimeBucket, string>` | 已过期 / 今天到期 / 明天到期 / 2–7 天 / 更晚 / 无到期日 |
| `BUCKET_ORDER` | `TimeBucket[]` | 展示顺序，无到期日永远垫底（与 `GROUP_ORDER` 同向） |
| `bucketOf` | `(f: Pick<Freshness, 'state' \| 'remainDays'>) => TimeBucket` | 单件 → 桶 |
| `TimeBucketBundle` / `groupByTimeline` | `(list) => TimeBucketBundle<T>[]` | 切成带桶头的段落，空桶自动跳过 |

### ★ 为什么桶的判定建立在 `Freshness` 之上

分组视图与时间轴视图必须对「哪件该先吃」给出**同一个答案**。如果这里自己按 `expireAt`
再算一遍距离，就会出现「分组里在『新鲜』、时间轴里在『今天到期』」的矛盾，而这种矛盾
用户是查不出来的 —— 只能得出「这 App 有点毛病」的结论。所以本模块**不重新解析日期**，
只读 `Freshness` 的 `state` / `remainDays`。

- `warn`（不建议存放）与 `none`（未设保质期）都归 `none` 桶，与 `groupOf` 处理一致；
- `soon` / `fresh` 按剩余天数落桶，所以阈值改变时两个视图的表现是联动的。

约定与 `groupByFreshness` 相同：**保持传入顺序**（只分桶，不排序）、**空桶跳过**。

```ts
import { groupByTimeline } from '@/domain/timeline';

groupByTimeline(sortedRows);   // sortedRows 需已带 state / remainDays
// → [{ bucket: 'over', label: '已过期', items: [...] },
//    { bucket: 'week', label: '2–7 天', items: [...] }]
```

---

## price.ts — **v3**：金额口径的唯一定义

| 导出 | 签名 | 说明 |
| --- | --- | --- |
| `round2` | `(n: number) => number` | 两位小数取整（金额与数量共用） |
| `normalizePrice` | `(v: unknown) => number \| null` | 有限非负数原样返回，**其余一律 `null`** |
| `priceFromInput` | `(raw: string) => number \| null` | 输入框字符串 → 单价；空串 → `null` |
| `amountOf` | `(unitPrice: number \| null \| undefined, qty: number) => number \| null` | 本次金额 = 单价 × 数量 |
| `unitPriceText` | `(unitPrice, unit) => string` | 单价展示文案 `¥1.5/斤`；**没填价返回空串**（列表里不占位） |

### 三条约定

1. **`null` = 没填价，`0` = 真的免费。** 把「没填」当 0 累加，会让「浪费金额」看起来是个
   真实数字，实际只统计了填过价的那部分 —— 这是最贵的一类 bug，因为它不会报错。
2. **单价是有限非负数。** 负数把月度统计拉成负数，`Infinity` 让它永久显示 `¥Infinity`。
3. **日志存快照。** `ConsumeLog.price` 是「本次金额」（单价 × 本次数量），
   `ConsumeLog.unitPrice` 是消耗当时的单价；事后改物品单价**不改历史日志**。

### ★ 为什么单独开一个模块

之前这套规则散在四处且各不相同：`bulk.buildConsumeLog` 是一份、`ConsumeSheet` 与
`GroupConsumeSheet` 各抄一份、`data/backup/sanitize` **只洗了日志侧、漏了物品侧**。
最后那一处最致命：备份文件是纯 JSON、可以手改，一条 `"price": "12.5"` 就原样进库，
之后 `price × 数量 = NaN`，整月「浪费金额」跟着烂掉。

现在**所有**入口都过这个模块：

| 位置 | 用法 |
| --- | --- |
| `itemFactory.createItem` | 物品的唯一诞生点，落库前归一一次 |
| `stores/items.save` | 编辑后写入前再归一一次（兜住别处拼出来的 Item） |
| `stores/barcodes.upsert/update` | 条码映射里的单价 |
| `inbound.inboundDefaults` / `inboundInput` | 清单入库的推断价与确认价 |
| `bulk.buildConsumeLog` | 日志的 `price`（本次金额）与 `unitPrice`（快照） |
| `stats.*` 三处累加 | 累加前先归一，避免字符串 `+=` 拼出 `"035"` |
| `data/backup/sanitize` | 导入清洗（**唯一不可信数据的入口**） |
| `ConsumeSheet` / `GroupConsumeSheet` / `ConsumeLogView` | 展示层的金额格式化 |

```ts
import { amountOf, normalizePrice, priceFromInput } from '@/domain/price';

normalizePrice('12.5');        // null（外部数据的字符串，不是数字）
priceFromInput('1e999');       // null（会变 Infinity）
amountOf(1.5, 2);              // 3  —— 20 个鸡蛋扔 2 个 = 3 元，不是整份 30 元
amountOf(null, 2);             // null —— 不是 0
```

### ⚠️ 表单入口必须走 `priceFromInput`

`min="0"` 只是 HTML 校验，挡不住手输 `-5`；`1e999` 会变成 `Infinity`。
两个值都能写进库，然后污染整月统计。

---

## accent.ts — 主题色

用户选的主色**不能直接用**：可能是荧光黄（白字读不出）、近白（按钮陷进浅色底）或近黑（深色模式里看不见）。
这个文件负责把任意 hex 校正成可用主色，并派生整条色阶。纯数学、零依赖，可以在 Node 里直接跑。

```ts
import { ACCENT_PRESETS, accentScale, contrastRatio, resolveAccent } from '@/domain/accent';

resolveAccent('#ffff00', 'light');  // { hex: '#7a7a00', adjusted: true } —— 荧光黄被压暗
accentScale('#228055', 'dark');     // { '--primary-50': '#173027', …, '--focus-ring': '#7fc9a5' }
contrastRatio('#ffffff', '#228055'); // 4.9
```

| 成员 | 说明 |
| --- | --- |
| `ACCENT_PRESETS` | 6 个预设色（`{ id, name, hex }`），深浅两套都做过对比度自测 |
| `DEFAULT_ACCENT` | 默认色，与 `DEFAULT_SETTINGS.accent` 同源（不要在别处再写一份） |
| `THEME_MODES` | 三档选项（跟随系统 / 浅色 / 深色），顺序即 UI 顺序 |
| `normalizeHex(input)` | `#abc` → `#aabbcc`，非法返回 `null` |
| `contrastRatio(a, b)` | WCAG 对比度（1–21） |
| `resolveAccent(hex, mode)` | 校正主色 → `{ hex, adjusted }` |
| `accentScale(hex, mode)` | 派生色阶 → `--primary-50/100/500/600/700` + `--focus-ring` |

### 两条硬约束（顺序即优先级）

1. **白字在主色上 ≥ 4.5:1** —— 主色是按钮底色、按钮字是白色，不满足就是不可读。
2. **主色与所在模式的底色 ≥ 3:1** —— 浅色模式太浅、深色模式太暗，按钮会「陷进」背景（WCAG 1.4.11 非文本对比）。

冲突时（深色模式下选了又暗又灰的色）**文字对比度优先**。`adjusted: true` 时 UI 必须提示用户，否则他以为自己选的色没生效。

### 语义色不参与

环境色（`ENV_MAP` 的 chilled/frozen/…）与新鲜度四态（fresh/soon/urgent/over）**不跟随主题色**。
「冷藏=蓝、临期=橙、过期=灰」是用户已建立的语义，跟着品牌色变会失去辨识度。

### 为什么不走 CSS `color-mix()`

`color-mix()` 做不了「不达标就继续调」的闭环，而且老 WebView（Capacitor 壳）未必支持。
这里在 JS 里算完，由 `composables/useTheme.ts` 写成 `<html>` 的 inline style，最稳。

---

## settings.ts — 设置归一（**v1.0.1**）

`Settings` 有两个来源都可能是脏的：**旧版本留下的 IndexedDB 记录**（没有新字段）和**手改过的备份 JSON**
（`"remindEnabled": "false"` 是真值、`lastBackupAt: "abc"` 让「上次备份」算出 NaN、`id` 不是 `'singleton'`
时整条被忽略还留一行垃圾）。所以归一规则**只能住 domain**：导入路径不经过 store，写在 store 里就漏了一条。

```ts
import { normalizeSettings } from '@/domain/settings';

normalizeSettings({ id: 'x', remindEnabled: 'false', lastBackupAt: 'abc' });
// → { id: 'singleton', remindEnabled: true, lastBackupAt: null, … }（缺的字段全用 DEFAULT_SETTINGS）
```

| 规则 | 做法 |
| --- | --- |
| `id` | 恒为 `'singleton'`（单例表，主键写错就该纠正，不是丢弃） |
| 布尔 | `typeof v === 'boolean'` 才算数，字符串一律回落 `DEFAULT_SETTINGS` |
| 枚举 | `themeMode` / `stockViewMode` / `accent` 白名单或格式校验后回落 |
| 数值 | `soonDays` / `urgentDays` / `remindHour` / `remindMinute` clamp；`urgentDays ≤ soonDays` |
| 时间戳 | 非有限正数 → `null`（`null` 是合法语义：从没备份 / 从没提醒过） |

`now` 参数只为可测试性；store 与 `importBackup` 共用这一个函数，**不要再在别处拼一份 `{ ...DEFAULT_SETTINGS }`**。

---

## 在本层新增函数的检查清单

- [ ] 是否真的属于「规则」？纯格式转换放 `dates.ts`，别新建文件。
- [ ] 有没有 import Dexie / Pinia / Vue / `data/` / `stores/`？有就是放错层了。需要字典/存储时用**依赖注入**（`ShelfLifeResolver` / `AliasKeyResolver`），让调用方把实现传进来。
- [ ] 时间是否通过参数 `now = Date.now()` 注入？**不要在函数内部直接调 `Date.now()`**，否则不可测试。
- [ ] **有没有写 JSDoc**（`@param` / `@returns` / 边界条件 / `@example`）？
- [ ] 消费**外部数据**（备份文件）的日期字段时，先过 `isDateStr`。
- [ ] 新增领域函数 → 同步补 `src/domain/__tests__/*.test.ts`。
- [ ] 有没有同步更新本 README 的表格与根 `AGENTS.md`？
