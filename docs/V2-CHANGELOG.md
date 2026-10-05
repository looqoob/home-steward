# v2 变更说明（2026-10-05）

> 本文件记录 v2 引入的**新概念与新坑**。原有的分层约定、命名风格、设计 token 规范见
> [AGENTS.md](../AGENTS.md) 与各目录 README，本文不重复。
>
> v2 落地范围：清单一键入库 · 今日待办 · 批量操作 · 备份提醒 · 条码扫描。

---

## 1. 新增的领域模块

| 模块 | 职责 | 关键导出 |
| --- | --- | --- |
| `domain/todo.ts` | 今日待办的计算 | `buildTodayTodo` / `isSnoozed` / `snoozeUntilOf` |
| `domain/inbound.ts` | 清单入库的默认值推断 | `inboundDefaults` / `inboundInput` / `inboundInputs` |
| `domain/bulk.ts` | 批量操作的规划 | `planBulkConsume` / `planBulkMove` / `planBulkRemove` / `BulkOp` |
| `domain/backup.ts` | 未备份提醒的计算 | `backupAdvice` |
| `domain/normalize.ts` | 名称归一化（**从 `data/dict/normalize.ts` 迁入**） | `normalizeName` / `firstChar` |

### 为什么 `normalizeName` 要迁到 domain

它不碰任何数据源，是纯字符串函数，属于领域逻辑。v2 的 `domain/inbound.ts` 需要用它做
「清单项 ↔ 历史物品」的名称匹配，若让 `domain` 反向依赖 `data` 就破坏了既有分层
（`domain → data → stores → views`）。

`src/data/dict/normalize.ts` 保留为**转出层**（`export { ... } from '@/domain/normalize'`），
既有引用（`stores/dict.ts`、`views/StockView.vue`）不用改。

---

## 2. ★ 三个必须知道的一致性约束

### 2.1 待办的数字、列表、通知必须同源

三处都用 `buildTodayTodo()`，**不要各筛各的**：

| 位置 | 用法 |
| --- | --- |
| `views/StockView.vue` | 概览卡「今日待吃」= `todo.length` |
| `components/TodayTodo.vue` | 待办列表 = `buildTodayTodo(...)` |
| `composables/useReminder.ts` | `due()` 内部调用 `buildTodayTodo` |

否则会出现「概览卡显示 3，点进去只有 2 条」「待办里没有它，通知却弹出来」——
用户对整个提醒功能的信任会直接崩掉。

> 顺带修掉的历史问题：概览卡「已过期」原来由 `stats.todayOverview()` 算，
> 它不认识 `snoozeUntil`。现在改为从 `rows` 里数（同样排除延后项），与列表一致。
> `todayOverview()` 保留但库存页已不再调用。

### 2.2 「明天再说」只隐藏，不改到期日

`Item.snoozeUntil` 的语义边界：**只影响今日待办列表与提醒推送，绝不碰 `expireAt`**。

它表达的是「我今天不想处理它」，不是「它变新鲜了」。改了到期日会污染库存列表的
新鲜度排序和浪费统计。被延后的物品**仍然留在**库存列表的「紧急待吃」分组里，
不会消失。

### 2.3 批量撤销的顺序不能反

```ts
// ✅ 正确：先删日志，再写回商品快照
for (const id of op.logIds) await db.logs.hardDelete(id);
await db.items.bulkPut(items);
```

反了会留下「商品状态是 `in_stock`、日志却记着已消耗」的脏账，统计页对不上。

---

## 3. 批量写库：不要循环调 `add()`

`stores/items.add()` 内部每次都 `await load()`（全量重读 items + logs）。
批量入库 20 件就会触发 20 次全表读。

**批量路径一律用 `items.addMany()`**：一次 `bulkPut` + 一次 `load`。
`addMany` 的品类解析与 `add()` 完全一致（`lookupFood(name)?.category ?? null`），
否则批量入库的卡片图标/品类会和单个入库对不上。

`bulkConsume` / `bulkMoveTo` / `bulkRemove` 内部也都是 `bulkPut` + 单次 `load`。

---

## 4. 新增的可选字段（旧数据免迁移）

| 字段 | 位置 | 说明 |
| --- | --- | --- |
| `Item.snoozeUntil?: number \| null` | `domain/types.ts` | `undefined` 视作未延后 |
| `ShoppingItem.inboundItemId?: string \| null` | `domain/types.ts` | `undefined` 视作未入库 |
| `BarcodeEntry` | `domain/types.ts` | v2 新表 |

读取时**一律用 `?? null` 兜底**，不要写 `item.snoozeUntil > now`：
旧数据里是 `undefined`，依赖隐式类型转换（结果碰巧是 `false`）很脆。

---

## 5. Dexie 升到 version(2)：备份格式五处同步

新增 `barcodes` 表后，`SCHEMA_VERSION` 从 1 升到 2。**这五处必须同步改，漏一处就有 bug**：

| 文件 | 改什么 |
| --- | --- |
| `domain/types.ts` | `SCHEMA_VERSION = 2` |
| `data/backup/schema.ts` | `BackupFile.barcodes?: BarcodeEntry[]`（**可选**，v1 备份没这个键） |
| `data/backup/export.ts` | `buildBackup` 带上 `barcodes`，`version` 改用 `SCHEMA_VERSION` 常量 |
| `data/backup/import.ts` | `?? []` 兜底 + replace/merge 两条路径都要写 |
| `data/dexie/sources.ts` | **`wipe()` 与 `transaction()` 的表清单加 `barcodes`** |

> 最容易漏的是 `wipe()`：漏了会导致「覆盖导入」后旧条码映射残留。
> `export.ts` 里 `version` 写死 `1` 也是同类错误——已改为引用常量，以后升版自动跟上。

**v1 备份仍可导入**：`validateBackup` 只拒绝 `version > SCHEMA_VERSION`，
所以 `1 ≤ 2` 通过校验，缺的 `barcodes` 由 `?? []` 兜底。

---

## 6. 条码的三个坑

### 6.1 `code` 必须用 `string`

EAN-8 / EAN-13 存在**前导 0**。`Number("0123456789012")` → `123456789012`，条码再也匹配不上。
全链路（类型、Dexie 索引、`byCode` 查询、输入框）都用 string。

### 6.2 关闭扫描页必须停摄像头轨道

只调 `scanner.stop()` 不够，摄像灯会一直亮、持续耗电。`ScanSheet.stopScanner()` 做三件事：

1. `await scanner?.stop()`
2. `scanner?.clear()`
3. **`video.srcObject.getTracks().forEach(t => t.stop())`** ← 最容易漏的一步

`watch(modelValue)` 关闭时调 + `onBeforeUnmount` 再兜一次。

### 6.3 不要让 domain 依赖 data

扫码录入后要拿品类，品类来自 `data/dict`。`ScanSheet` 是**组件层**，
直接调 `useDictStore().resolve` 即可，不要为了它把 `lookupFood` 引进 `domain`。

---

## 7. 多选态的交互细节

- **长按 500ms 进入**，但必须监听 `pointermove`：位移超过 10px 就取消计时，
  否则在列表上按住滑动（想滚动）会误触选中。见 `ItemCard.vue` 的 `onPointerMove`。
- **多选态放在路由 query（`?select=1`）而不是本地 `ref`**：外壳 `TabLayout` 需要知道
  「隐藏 FAB、底部多留 132px」，那是另一个组件。走 query 让两边看同一个真值，
  不用 provide/prop 把外壳和页面耦合起来。
- 多选时概览卡/待办/搜索/筛选条**全部隐藏**：避免筛选变化导致选中集合被清空
  （`StockView` 里仍留了一个 watch 做兜底清理）。
- 「换位置」确认文案必须写明**会重算到期日**，这是用户最容易忽略的副作用。

---

## 8. 清单入库的默认值推断

```
数量：清单项自带 → 上次同名称入库的数量 → 1
单位：清单项自带 → 上次同名称的单位 → '个'
位置：清单项自带 → 上次同名称的位置 → 第一个启用位置
```

名称匹配走 `normalizeName`，否则清单里写「西红柿」、历史库存里存「番茄」就匹配不上，
每次都要手选位置。

`planShopping` 现在会把「最近一次消耗的数量」写进 `Suggestion.quantity`，
让「库存 0」类建议能预填数量。

---

## 9. 新的依赖

`html5-qrcode`（MIT，免费、无网络请求），且是**动态 import**：

```ts
const mod = await import('html5-qrcode');
```

构建产物里它被拆成独立 chunk（约 360 KB），**不进主包**（主包 58 KB / gzip 23 KB），
只有真正打开扫描页才加载。

该包不自带 TS 类型，声明在 `src/types/html5-qrcode.d.ts`——
**不要用 `as any` 绕过**，否则摄像头 start 参数写错也不会报错。

---

## 10. 改动文件清单（38 个）

**新增（13）**

```
src/domain/todo.ts              今日待办
src/domain/inbound.ts            清单入库推断
src/domain/bulk.ts               批量操作规划
src/domain/backup.ts             备份提醒
src/domain/normalize.ts          名称归一化（从 data 迁入）
src/stores/barcodes.ts           条码映射
src/components/TodayTodo.vue     今日待办区块
src/components/ShoppingInboundRow.vue  行内入库卡
src/components/BulkActionBar.vue      批量操作条
src/components/LocationPickerSheet.vue 位置选择弹层
src/components/ScanSheet.vue      扫码入库
src/components/BarcodeManageView.vue 条码映射管理
src/types/html5-qrcode.d.ts      条码库类型声明
```

**修改（25）**

```
src/domain/types.ts               三个新字段/类型 + SCHEMA_VERSION
src/domain/shoppingRules.ts       Suggestion.quantity
src/data/dexie/db.ts              version(2) + barcodes 表
src/data/dexie/sources.ts         barcodes 仓储 + wipe/transaction
src/data/repository.ts            BarcodeRepository
src/data/backup/{schema,export,import}.ts   备份格式 v2
src/data/dict/normalize.ts        改为转出层
src/stores/items.ts               addMany / snooze / bulk* / undoBulk
src/stores/shopping.ts            restore / inbound* / undoInbound
src/composables/useReminder.ts    due() 改为复用 buildTodayTodo
src/components/{ItemCard,QuickAddSheet}.vue  多选态 / 扫码入口
src/layouts/TabLayout.vue         多选与扫码的承载
src/router/index.ts               /barcodes 路由
src/views/{StockView,ListView,MeView,ItemEditView,BackupView}.vue
src/App.vue                       barcodes store 启动加载
```

---

## 11. 尚未处理的两件事

1. **Android 相机权限**：`android/` 目录尚未生成（需先 `npm run cap:add`），
   `AndroidManifest.xml` 里的 `CAMERA` 权限声明要在生成后手动加。
   步骤见 README「扫码入库的相机权限」。不加也能用，会降级为手动输入条码。
2. **真机验证**：清单入库、批量操作、条码扫描都涉及触摸手势与摄像头，
   必须在 320px 宽的真机浏览器 + Android WebView 上各验一遍，
   尤其是「关闭扫描页后摄像灯是否熄灭」。
