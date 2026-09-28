# stores — Pinia 状态层

> **定位：薄层。** store 只做三件事：持有响应式状态、编排「读 → 调 domain 规则 → 写」、提供派生 getter。
> **业务规则一律在 `domain/`，持久化一律通过 `src/data` 的 `db`。**
> 全部用 **setup store**（`defineStore('x', () => {...})`）写法，不用 options store。

## ⚠️ 最常见的坑：computed 已解包

setup store 返回的 `ref` 和 `computed` 在 store 实例上**已自动解包**：

```ts
const dict = useDictStore();
const fn = dict.resolve;   // ✅ 直接就是函数
const fn = dict.resolve.value;  // ❌ 报类型错误 —— 实例上没有 .value
```

只有在 store **内部**实现里才需要 `.value`：

```ts
// stores/dict.ts 内部
const resolve = computed(() => createResolver(map.value));  // ✅ 内部要用 .value
```

同理，`ref` 在外部也是直接 `store.settings`、`store.list`，不需要 `.value`。

---

## 通用模式

五个 store 结构高度一致，**照抄即可**：

| 成员 | 说明 |
| --- | --- |
| `list: Ref<T[]>` | 全量数据（含内存中的历史，一般已过滤软删） |
| `loaded: Ref<boolean>` | 是否已完成首次加载 |
| `load()` | 从 `db` 全量重读并覆盖内存。**所有写操作末尾都会调它** |
| 派生 `computed` | 过滤/排序后的视图数据 |

**为什么每个写操作都 `await load()` 全量重读？**
数据量级是「家庭」：几百件商品、几千条日志。全量重读换来的是「内存状态永远等于存储状态」，消灭了整类「改了数据忘了同步 UI」的 bug。别为了微优化改成增量同步，除非实测有性能问题。

---

## items — 商品 + 消耗日志

`useItemsStore()`

### 状态

| 成员 | 类型 | 说明 |
| --- | --- | --- |
| `list` | `Ref<Item[]>` | 全部商品 |
| `logs` | `Ref<ConsumeLog[]>` | 消耗/丢弃日志 |
| `loaded` | `Ref<boolean>` | |
| `active` | `ComputedRef<Item[]>` | **最常用**：`!deletedAt && status === 'in_stock'` |

### 方法

| 方法 | 签名 | 说明 |
| --- | --- | --- |
| `load` | `() => Promise<void>` | 并行重读 `items` 与 `logs` |
| `byId` | `(id) => Item \| undefined` | 同步查找，过滤软删 |
| `add` | `(input: NewItemInput) => Promise<Item>` | 新建。内部查 `lookupFood` 拿品类、查位置取环境、调 `createItem` 算到期日，**返回落库后的 Item** |
| `save` | `(item: Item) => Promise<void>` | 整条覆盖写入，自动刷 `updatedAt` |
| `moveTo` | `(id, locationId) => Promise<void>` | 切换位置并**重算到期日**（`storedAt` 不变） |
| `setManualShelfLife` | `(id, days: number \| null) => Promise<void>` | 设/清手填保质期并重算。`days <= 0` 归一化为 `null`（即关闭手填） |
| `consume` | `(id, type: ConsumeType) => Promise<void>` | 用掉 / 扔掉：写一条 `ConsumeLog`，并把商品置 `'finished'` |
| `remove` | `(id) => Promise<void>` | 软删除（不写日志，用于误添加） |
| `recomputeAll` | `() => Promise<void>` | 用当前字典重算所有在库商品的到期日（**字典变更后必须调**） |

### 边界条件

- `add` 若找不到 `input.locationId` 对应的位置，`envOf` 会退化成 `'cool'`，不会抛错。
- `moveTo` / `setManualShelfLife` 如果商品不存在 → **静默返回**，不抛错。
- `consume` 会计算 `overdueDays`（过期则为过期天数，否则 0；无 `expireAt` 时为 `null`），写进日志供「本月浪费金额」统计使用。
- `consume` 不会重复二次消耗：商品变 `'finished'` 后就不在 `active` 里了，但**方法本身不校验**，重复调用会再写一条日志。UI 层的按钮已隐藏，暂不加防御。
- **`recomputeAll` 只处理 `active`（在库）商品**，历史记录的天数快照不会被改写。

### 示例

```ts
import { useItemsStore } from '@/stores/items';

const items = useItemsStore();

// 快速入库
await items.add({ name: '牛奶', quantity: 2, unit: '盒', locationId: fridgeId, price: 12.5 });

// 换到常温，到期日自动重算
await items.moveTo(itemId, pantryId);

// 手填 30 天（优先级最高，后续换位置也不会被字典覆盖）
await items.setManualShelfLife(itemId, 30);

// 用掉了
await items.consume(itemId, 'consumed');
await items.consume(itemId, 'wasted');
```

---

## locations — 位置

`useLocationsStore()`

### 状态

| 成员 | 类型 | 说明 |
| --- | --- | --- |
| `list` | `Ref<Location[]>` | 全部位置 |
| `loaded` | `Ref<boolean>` | |
| `all` | `ComputedRef<Location[]>` | 未删除，按 `sort` 升序 |
| `enabled` | `ComputedRef<Location[]>` | `all` 中 `enabled === true` 的（Tab 筛选栏用这个） |

### 方法

| 方法 | 签名 | 说明 |
| --- | --- | --- |
| `load` | `() => Promise<void>` | |
| `byId` | `(id) => Location \| undefined` | 同步查找 |
| `envOf` | `(id) => EnvType` | 取环境，**找不到时返回 `'cool'`**（不抛错） |
| `create` | `(input: NewLocationInput) => Promise<Location>` | 新建。名称 `trim()` 后**截断到 6 个字符**；icon 缺省取名称首字 |
| `update` | `(id, patch: Partial<Location>) => Promise<void>` | 局部更新 |
| `toggle` | `(id) => Promise<void>` | 启停切换 |
| `remove` | `(id, items) => Promise<{ ok; message }>` | 删除。**必须先过 `canDeleteLocation` 校验**；返回可直接展示的失败原因 |
| `move` | `(id, dir: -1 \| 1) => Promise<void>` | 上移/下移。内部整表重排 sort 为 10/20/… |
| `countOf` | `(id, items) => number` | 该位置在库数量 |

### 边界条件

- `create` 的名称**硬截断到 6 字**（原型约束：位置名太长会撑破 chip）。UI 层应该同步做 `maxlength`。
- `remove` 需要调用方**传入 item 列表**（一般是 `items.list`），因为它不该直接依赖 items store（避免循环依赖 + 保持纯参数）。校验失败时返回 `{ ok: false, message: '该位置还有 N 件在库物品，请先移出或停用' }`，**不会执行删除**。
- `move` 在首项上移或末项下移时**静默返回**（索引越界就 return），不高亮报错。

### 示例

```ts
import { useLocationsStore } from '@/stores/locations';

const locs = useLocationsStore();
const items = useItemsStore();

await locs.create({ name: '酒柜', icon: '酒', env: 'dark' });

const res = await locs.remove(id, items.list);
if (!res.ok) toast.show(res.message);

await locs.move(id, -1);   // 上移
const n = locs.countOf(id, items.list);
```

> `remove` / `countOf` 的参数类型是宽泛的 `{ locationId; status; deletedAt }[]`，内部用 `as never` 适配 `domain` 的签名 —— 这是一种刻意的解耦，避免 stores 之间强类型互相绑定。新增调用时别去改这个签名。

---

## dict — 自定义字典

`useDictStore()`

### 状态

| 成员 | 类型 | 说明 |
| --- | --- | --- |
| `entries` | `Ref<DictEntry[]>` | 全部自定义条目 |
| `loaded` | `Ref<boolean>` | |
| `map` | `ComputedRef<Map<string, DictEntry>>` | 键格式 `` `${归一化名称}|${env}` `` |
| `resolve` | `ComputedRef<ShelfLifeResolver>` | ★ **四级兜底解析器，直接传给 `domain` 函数**（注意：无 `.value`） |

### 方法

| 方法 | 签名 | 说明 |
| --- | --- | --- |
| `load` | `() => Promise<void>` | |
| `upsert` | `(dictKey, displayName, env, days, reason) => Promise<void>` | 新增或覆盖。已存在则保留 id、更新 days/reason/displayName 与 `updatedAt` |
| `reset` | `(dictKey, env) => Promise<void>` | 删除某条自定义（**软删除**，回落到内置/品类兜底） |
| `isCustom` | `(dictKey, env) => boolean` | 该组合是否被用户自定义过 |
| `normalize` | `(s) => string` | 直接暴露 `normalizeName`，UI 里复用 |

### 边界条件

- `upsert` 内部会 `normalizeName(dictKey)`，所以传入 `'西红柿（大）'` 会自动归一。
- `days` 允许传 `NOT_RECOMMENDED (-1)` —— 表示「我明确不想让它放这」。
- `reset` 找不到对应条目时**静默返回**。
- **改完字典后，调用方有责任触发 `items.recomputeAll()`**，否则已有商品的到期日不会更新。

### 示例

```ts
import { useDictStore } from '@/stores/dict';

const dict = useDictStore();

await dict.upsert('榴莲', '榴莲', 'chilled', 5, null);
dict.isCustom('榴莲', 'chilled');            // true

await dict.reset('榴莲', 'chilled');         // 删掉自定义，回落到内置/品类
await items.recomputeAll();                  // ★ 别忘了重算已有商品

// 传给 domain 函数
const r = computeExpiry(input, 'chilled', dict.resolve, fallbackDays);
```

---

## shopping — 购物清单

`useShoppingStore()`

### 状态

| 成员 | 类型 | 说明 |
| --- | --- | --- |
| `list` | `Ref<ShoppingItem[]>` | 全部条目 |
| `loaded` | `Ref<boolean>` | |
| `visible` | `ComputedRef<ShoppingItem[]>` | 未删除 |
| `pending` | `ComputedRef<ShoppingItem[]>` | 未勾选（待买） |
| `done` | `ComputedRef<ShoppingItem[]>` | 已勾选（已买） |

### 方法

| 方法 | 签名 | 说明 |
| --- | --- | --- |
| `load` | `() => Promise<void>` | |
| `generate` | `() => Promise<number>` | 调 `planShopping` 生成建议并落库，**返回新增条数**（0 表示没有新建议） |
| `toggle` | `(id) => Promise<void>` | 勾选/取消勾选，同步 `checkedAt` |
| `addManual` | `(name: string) => Promise<void>` | 手动添加。`name` 为空（`trim()` 后）**静默返回** |
| `remove` | `(id) => Promise<void>` | 删除。**自动项**：软删 + 设 `dismissedUntil = now + 7 天`（7 天内不再自动重生）；**手动项**：直接软删 |
| `clearDone` | `() => Promise<void>` | 清除已勾选项（同样是软删 + dismissedUntil） |

### 边界条件

- `generate()` 是**幂等**的（`domain/shoppingRules.ts` 保证），App 每次启动都可以安全调用，不会产生重复建议。
- 删除行为的分岔全靠 `auto` 标记：自动建议项 `auto: true`，手动项 `auto: false`。
- `DISMISS_MS = 7 天`：删除一个自动建议，是「7 天内别再烦我」，不是永久忽略。7 天后如果条件仍然满足会重新出现。这是设计意图。
- `generate()` 依赖 `items` 与 `settings` store 已加载完成，否则结果为空。

### 示例

```ts
import { useShoppingStore } from '@/stores/shopping';

const shopping = useShoppingStore();

await items.load();     // 先保证依赖数据就绪
const added = await shopping.generate();
if (added) toast.show(`新增 ${added} 条建议`);

await shopping.addManual('垃圾袋');
await shopping.toggle(id);
await shopping.remove(id);
await shopping.clearDone();
```

---

## settings — 单例设置

`useSettingsStore()`

### 状态

| 成员 | 类型 | 说明 |
| --- | --- | --- |
| `settings` | `Ref<Settings>` | 完整设置对象。初始值已填 `DEFAULT_SETTINGS`，**不是 null** |
| `loaded` | `Ref<boolean>` | |

### 方法

| 方法 | 签名 | 说明 |
| --- | --- | --- |
| `load` | `() => Promise<void>` | 从 db 读取（repository 保证缺失时自动补写默认） |
| `patch` | `(p: Partial<Settings>) => Promise<void>` | 局部更新并落库，自动刷 `updatedAt` |

### 关键字段

| 字段 | 默认 | 说明 |
| --- | --- | --- |
| `remindEnabled` | `true` | 临期提醒总开关 |
| `remindHour` / `remindMinute` | `9` / `0` | 每日提醒时刻 |
| `soonDays` | `14` | 「临期」阈值（≤ 此值显示 `soon`） |
| `urgentDays` | `3` | 「紧急」阈值（≤ 此值显示 `urgent`） |
| `lastRemindAt` | `null` | 上次提醒时间戳 |
| `lastBackupAt` | `null` | 上次备份时间戳 |

### 边界条件

- `patch` 是局部更新，不需要先展开整个对象。内部 `{ ...settings.value, ...p, updatedAt: Date.now() }`。
- **`soonDays` / `urgentDays` 变更后要重算新鲜度** —— 因为它们是 `freshnessOf` 的入参，所有使用方传入的都是 store 引用，computed 会自动重算，**但要注意 `todayStr()` 不会被缓存**（见 `domain/README.md` 的跨零点问题）。

### 示例

```ts
import { useSettingsStore } from '@/stores/settings';

const settings = useSettingsStore();
await settings.patch({ remindEnabled: true, remindHour: 20, remindMinute: 30 });
await settings.patch({ urgentDays: 5 });

// 视图里的双向绑定（computed setter 写法）
const urgentDays = computed({
  get: () => settings.settings.urgentDays,
  set: (v) => settings.patch({ urgentDays: v }),
});
```

---

## 新增 store / 改接口的检查清单

- [ ] 用的是 setup store，且所有 `computed` / `ref` 都 return 出去了（没 return 的视图拿不到）
- [ ] 每个写操作末尾 `await load()`
- [ ] 需要持久化的都经过 `db`，**没有直接 import `dexieDb`**
- [ ] 业务规则放在 `domain/`，store 只是把它串起来
- [ ] 存在「幂等 / 重复调用」风险的方法，在 JSDoc 里写清楚了
- [ ] 同步更新了本 README 的表格
- [ ] 同步更新了根 `AGENTS.md`
