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
| `addMany` | `(inputs: NewItemInput[], opts?: { merge?: boolean }) => Promise<Item[]>` | **v2**：批量新建。一次 `bulkPut` + 一次 `load`。品类解析与 `add()` 完全一致。`opts.merge === false` 关闭**跨 input 合并**（清单「全部入库」必须关，见边界条件） |
| `snooze` | `(id, days = 1) => Promise<void>` | **v2**：「明天再说」。只写 `snoozeUntil`，**不动 `expireAt`**。`days <= 0` = 立即取消延后 |
| `unsnooze` | `(id) => Promise<void>` | **v2**：取消延后，立即回到今日待办 |
| `save` | `(item: Item) => Promise<void>` | 整条覆盖写入，自动刷 `updatedAt` |
| `moveTo` | `(id, locationId) => Promise<void>` | 切换位置并**重算到期日**（`storedAt` 不变） |
| `setManualShelfLife` | `(id, days: number \| null) => Promise<void>` | 设/清手填保质期并重算。`days <= 0` 归一化为 `null`（即关闭手填） |
| `consume` | `(id, type: ConsumeType, qty?: number) => Promise<string>` | 用掉 / 扔掉，**支持部分消耗**：`qty` 缺省 = 全部（置 `'finished'`）；`qty < 剩余` 时只扣 `quantity`、状态保持 `'in_stock'`。**返回日志 id**（商品不存在、`qty <= 0` 或**同一物品已有消耗在飞**时返回 `''`） |
| `undoConsume` | `(logId: string) => Promise<void>` | 撤销一次消耗：删掉该日志、状态改回 `'in_stock'`，**部分消耗还会把数量加回去** |
| `remove` | `(id) => Promise<Item \| undefined>` | 软删除（不写日志，用于误添加）。**返回删除前的快照** |
| `restore` | `(snapshot: Item) => Promise<void>` | 撤销软删：把 `deletedAt` 置回 `null` 整条写回 |
| `recomputeAll` | `() => Promise<void>` | 用当前字典重算所有在库商品的到期日（`dict.upsert` / `dict.reset` 已**自动**调用） |
| `bulkConsume` | `(ids, type) => Promise<BulkOp \| null>` | **v2**：批量消耗，每件各自清空剩余量。返回撤销快照 |
| `bulkMoveTo` | `(ids, locationId) => Promise<BulkOp \| null>` | **v2**：批量换位置，逐件重算到期日 |
| `bulkRemove` | `(ids) => Promise<BulkOp \| null>` | **v2**：批量软删，**不写消耗日志**（不污染统计） |
| `undoBulk` | `(op: BulkOp \| null) => Promise<void>` | **v2**：撤销整批。**必须先删日志再写回商品快照** |

### ⚠️ 批量路径不要循环调 `add()`

`add()` 内部每次都 `await load()`（全量重读 items + logs），批量入库 20 件就会触发 20 次全表读。
批量一律走 `addMany()` 或上面三个 `bulk*` 方法，它们都是 `bulkPut` + 单次 `load`。

### 批量撤销的内存快照表

`bulkOps: Map<string, BulkOp>` 是**模块级内存变量，不落库**：

- 撤销入口只在 Toast 上存在 5 秒，为它建表不值得
- 刷新页面后撤销失效是可接受的代价
- 保留上限 20 条，超出丢弃最旧的，避免长时间使用后无界增长

### 边界条件

- `add` 若找不到 `input.locationId` 对应的位置，`envOf` 会退化成 `'cool'`，不会抛错。
- `moveTo` / `setManualShelfLife` 如果商品不存在 → **静默返回**，不抛错。
- `consume` 会计算 `overdueDays`（过期则为过期天数，否则 0；无 `expireAt` 时为 `null`），写进日志供「本月浪费金额」统计使用。
- `consume` 写入的 `ConsumeLog` 含两个**快照字段**：`unitPrice`（消耗时单价，`Item.price` 原样）与 `note`（物品备注 `item.note` 快照）。「消耗明细」页的「单价」「备注」列读它们；旧日志无这两字段（运行时 `undefined`），展示以 `== null` 兜底。「金额」读的是 `log.price`（= 单价 × 数量），**不是** `unitPrice`。
- `consume` 的 `qty` 会被钳到 `(0, 剩余数量]`：给多了按剩余算，`0` / 负数不写日志直接返回 `''`。数量保留 2 位小数（`0.5 斤` 这类输入不产生浮点残留）。
- **部分消耗的日志 `price` 是「单价 × 本次数量」**——`Item.price` 的语义是单价，直接抄过去会把「扔 2 个」记成整份的钱。
- `undoConsume` 靠**数量对账**区分整条 / 部分（批次 5，REV-32）：`cur.quantity === log.quantity`
  视为整条消耗（整条消耗时数量保留原值）不加回；不相等（部分消耗扣减过、或部分后紧跟整条）
  回加 `log.quantity`。此前只看 `status`，「部分消耗 + 整条消耗」后撤销前者会漏加。两次操作
  数量恰好相等的极端情况无法区分，按「不加回」处理（宁少勿错）。
- `consume` 不会重复二次消耗：商品变 `'finished'` 后就不在 `active` 里了，但**方法本身不校验**，重复调用会再写一条日志。UI 层的按钮已隐藏，暂不加防御。
- **`remove` 必须返回快照**：`db.items.all()` 会过滤掉 `deletedAt` 非空的行，删完就查不回来了，撤销只能靠这份快照。
- `undoConsume` 找不到日志时**静默返回**；`restore` 不校验 `deletedAt`，传错对象会直接写回。
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

// 用掉了 —— 返回日志 id，可用于撤销
const logId = await items.consume(itemId, 'consumed');
await items.undoConsume(logId);

// 部分消耗：20 个鸡蛋一次只用 2 个 → 20 变 18，仍在库
await items.consume(eggId, 'consumed', 2);

// 误添加后删除 —— 返回快照，可用于撤销
const snap = await items.remove(itemId);
if (snap) await items.restore(snap);
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
- `upsert` / `reset` 保存后会**自动**调用 `items.recomputeAll()` 重算在库商品的到期日
  （批次 4，REV-10）—— 此前这步要调用方「记得调」，字典页从来没调过，用户改了保质期、
  已有商品仍按旧日期提醒。历史日志与已消耗的成品不受影响。

### 示例

```ts
import { useDictStore } from '@/stores/dict';

const dict = useDictStore();

await dict.upsert('榴莲', '榴莲', 'chilled', 5, null);
dict.isCustom('榴莲', 'chilled');            // true

await dict.reset('榴莲', 'chilled');         // 删掉自定义，回落到内置/品类（自动重算在库商品）

// 传给 domain 函数
const r = computeExpiry(input, 'chilled', dict.resolve, fallbackDays);
```

---

## snapshots — 月末库存快照（v1.1 F4）

| 方法 | 签名 | 说明 |
| --- | --- | --- |
| `load` | `() => Promise<void>` | 整表读入（一月一行，量极小） |
| `ensureMonthly` | `(items, now?) => Promise<StockSnapshot | null>` | **次月首启**补写上月末快照（幂等）；空库不造空快照；跨多月只补最近一个月 |
| `byMonth` | `computed<(m: string) => StockSnapshot | null>` | 取某月快照 |

App 启动在 stores 就绪后调用 `ensureMonthly(items.list)`；生成逻辑是纯函数（`domain/snapshot.ts`）。

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
| `generate` | `() => Promise<number>` | 调 `planShopping` 生成建议并落库，**返回新增条数**（0 表示没有新建议）。数据源是 `db.shopping.allIncludingDeleted()`（含软删行）——「忽略 7 天」的抑制依据住在软删行里（REV-43） |
| `toggle` | `(id) => Promise<void>` | 勾选/取消勾选，同步 `checkedAt` |
| `addManual` | `(name: string) => Promise<void>` | 手动添加。`name` 为空（`trim()` 后）**静默返回** |
| `remove` | `(id) => Promise<ShoppingItem \| undefined>` | 删除，**返回删除前快照**（撤销要用）。**自动项**：软删 + 设 `dismissedUntil = now + 7 天`（7 天内不再自动重生）；**手动项**：直接软删 |
| `restore` | `(snapshot: ShoppingItem) => Promise<void>` | 撤销删除：清掉 `deletedAt` 与 `dismissedUntil` 后整条写回 |
| `restoreMany` | `(snapshots: ShoppingItem[]) => Promise<void>` | **批次 4**：批量撤销（`clearDone` 的撤销入口），一次 `bulkPut` + 一次 `load` |
| `clearDone` | `() => Promise<ShoppingItem[]>` | 清除已勾选项（软删 + dismissedUntil）。**一次 `bulkPut` 写完**并返回删除前快照（toast「撤销」用）；此前逐条 `put`，中途失败会清一半留一半（REV-19） |
| `inboundOne` | `(id, quantity, locationId, price = null) => Promise<Item \| null>` | **v2**：单项入库，走 `items.addMany`。**v3**：第 4 参是单价（`null` = 没填） |
| `inboundAll` | `(ids, overrides?) => Promise<{ count, skipped }>` | **v2**：批量入库。`skipped` 必须如实告知用户，不能静默丢弃 |
| `undoInbound` | `(id) => Promise<Item \| undefined>` | **v2**：撤销入库，返回被删物品的快照 |

### 边界条件（v2 新增）

- `inboundAll` **不用 `db.transaction`** 包「写物品 + 回写清单」：`items.addMany` 内部需要
  全量 `load()`，放进事务容易与事务外的读冲突。改成「先落物品、再回写清单项」两步 ——
  中途失败最坏结果是清单项没勾上但物品已入库（数据只多不少，不会丢），比事务回滚更安全。
- 入库时写入 `inboundItemId`，`undoInbound` 据此反查并删掉物品。旧数据没有这个字段，
  读取时按 `?? null` 处理（视作未入库）。
- **v3**：入库路径全部要带 `price`。三个入口（快速入库 / 扫码 / 清单行内）以前都不传，
  新建物品价格恒为 `null`，于是「浪费金额」统计长期是 0 —— 用户得回头进详情页一件件补，
  那条路径基本没人走。单价口径统一走 `domain/price.normalizePrice`。
- **v1.0.1**：`inboundAll` 调 `items.addMany(..., { merge: false })`。清单里两行同名（自动临期 + 手动）
  若合并成一条记录，两行会共享同一个 `inboundItemId`，而「撤销入库」是按「1 行 = 1 物品」回滚的
  → 撤销一行再入库就把数量算成双份。一条 input = 一条批次记录，与 AGENTS.md §5.6 一致。
- **v1.0.1**：`consume` / `consumeGroup` 用 `consumeInFlight` 挡连点：同一物品在飞时再调用返回 `''` / `null`。
  否则 qty=1 时双击 ✓ 会写两条日志（物品只 `finished` 一次），统计翻倍且撤销只能删一条。

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
| `load` | `() => Promise<void>` | 从 db 读取，**过 `domain/settings.normalizeSettings`**（repository 保证缺失时自动补写默认） |
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
- **归一规则不在这里**（v1.0.1 起）：`load()` 与备份导入都调 `domain/settings.normalizeSettings`。旧 IndexedDB 记录缺字段、导入了 `"remindEnabled": "false"` 这类脏值，都由那一个函数兜住。store 里**不要**再写一份 `{ ...DEFAULT_SETTINGS, ...raw }`。
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

## barcodes — 条码映射（v2 新增）

`useBarcodesStore()`

条码 → 名称的**本地**映射。隐私边界：只存本机，**不联网查询任何商品数据库**。
用户首次扫到未知条码时手输一次名称，之后扫码即可自动带出。

### 状态

| 成员 | 类型 | 说明 |
| --- | --- | --- |
| `list` | `Ref<BarcodeEntry[]>` | 全部映射（未删除） |
| `loaded` | `Ref<boolean>` | |

### 方法

| 方法 | 签名 | 说明 |
| --- | --- | --- |
| `load` | `() => Promise<void>` | |
| `lookup` | `(code: string) => Promise<BarcodeEntry \| undefined>` | 按条码查。内存没有时兜底查一次库 |
| `upsert` | `(input: BarcodeInput) => Promise<BarcodeEntry \| undefined>` | 同条码**覆盖**（扫错了要能改），不报重复错误 |
| `update` | `(id, patch: Partial<BarcodeInput>) => Promise<void>` | 管理页改名用。**v3**：`price` 不传 = 保留旧值，传 `null` = 清掉 |
| `remove` | `(id) => Promise<void>` | 软删 |

### ⚠️ `code` 必须是 `string`

EAN-8 / EAN-13 有**前导 0**：`Number("0123456789012")` → `123456789012`，条码永远匹配不上。
全链路（类型、索引、`byCode`、输入框）都用 string，**不要先转数字**。

---

## 新增 store / 改接口的检查清单

- [ ] 用的是 setup store，且所有 `computed` / `ref` 都 return 出去了（没 return 的视图拿不到）
- [ ] 每个写操作末尾 `await load()`
- [ ] 需要持久化的都经过 `db`，**没有直接 import `dexieDb`**
- [ ] 业务规则放在 `domain/`，store 只是把它串起来
- [ ] 存在「幂等 / 重复调用」风险的方法，在 JSDoc 里写清楚了
- [ ] 同步更新了本 README 的表格
- [ ] 同步更新了根 `AGENTS.md`
