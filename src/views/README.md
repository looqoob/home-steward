# views — 页面

> 一个路由一个 `.vue`。页面负责**编排**：读 store、调组件、处理路由跳转。
> 业务规则不准写在页面里 —— 需要计算请用 `domain/`，需要存请用 store。

## 路由映射

| 路由 | 文件 | 外壳 | 说明 |
| --- | --- | --- | --- |
| `/` → `/stock` | `StockView.vue` | TabLayout | 库存主页（默认Tab） |
| `/list` | `ListView.vue` | TabLayout | 购物清单 |
| `/me` | `MeView.vue` | TabLayout | 我的 / 统计 |
| `/item/new` | `ItemEditView.vue` | NavBar | 新建商品 |
| `/item/:id` | `ItemEditView.vue` | NavBar | 编辑商品 |
| `/locations` | `LocationManageView.vue` | NavBar | 位置管理 |
| `/dict` | `DictView.vue` | NavBar | 保质期字典 |
| `/appearance` | `AppearanceView.vue` | NavBar | 外观与主题（深浅模式 + 主题色） |
| `/settings` | `SettingsView.vue` | NavBar | 设置（提醒） |
| `/backup` | `BackupView.vue` | NavBar | 备份导出/导入（顶部显示上次备份时间） |
| `/barcodes` | `BarcodeManageView.vue` | NavBar | **v2**：条码映射的查看/改名/删除 |
| `/consume-log` | `ConsumeLogView.vue` | TabLayout + 顶栏（`meta.header`） | 消耗明细（每次用掉/扔掉的逐条记录） |
| `/stats` | `StatsView.vue` | TabLayout + 顶栏（`meta.header`） | **v3**：统计（趋势 / Top 浪费 / 周转天数 / 品类分布） |

### v3 新增的 query 参数状态

除 v2 的三个之外，v3 库存页又加了一个：

| query | 含义 | 读取处 |
| --- | --- | --- |
| `?check=1` | **v3** 盘点模式开 | `TabLayout`（据此隐藏 FAB）+ `StockView`（渲染 `StocktakePanel`） |

> ⚠️ `?view=timeline` **已废弃**：分组 / 时间轴的切换从页面 Tab 移到了
> 「设置 → 库存设置」（`Settings.stockViewMode`），不再走 query。见下方「三种展示方式」。

### v2 新增的 query 参数状态

有两个 UI 状态走**路由 query**而不是本地 `ref`，因为需要跨组件共享（外壳 `TabLayout` 也要读）：

| query | 含义 | 读取处 |
| --- | --- | --- |
| `?quickadd=1` | 快速入库弹框开 | `TabLayout` |
| `?scan=1` | **v2** 扫码入库弹框开 | `TabLayout` |
| `?select=1` | **v2** 库存页多选态开 | `TabLayout`（据此隐藏 FAB、底部多留 132px）+ `StockView` |
| `?check=1` | **v3** 库存页盘点模式 | `TabLayout`（隐藏 FAB）+ `StockView` |

> 用 query 而非 provide/prop：避免把外壳和页面耦合起来，两边看同一个真值。
> v3 把 `?select=1` 的**整组**语义也统一了（选/取消一组、盘点快照），见 `domain/grouping`。

路由定义在 `src/router/index.ts`，**全部懒加载**（`() => import('@/views/Xxx.vue')`）。

### 三种外壳

| 外壳 | 用途 | 顶栏 |
| --- | --- | --- |
| `TabLayout.vue`（见 `../layouts/`） | 三个主 Tab | **纯白无标题**（底部 Tab 已表明当前页），只撑安全区高度 |
| 页面自己渲染 `NavBar.vue` | 独立路由子页 | 标题 + 返回按钮，位于滚动容器外、天然满宽不滚动 |
| `TabLayout` + `meta.header` | 挂在 TabLayout 下但需要标题栏的页面（`/consume-log`） | 外壳渲染 `NavBar`，**页面里不要再写 `<NavBar>`**；滚动容器随之变 `pt-0 pb-0`，留白由页面自己的占位元素给（原因见 `../styles/README.md`「吸顶层」规则 5） |

---

## StockView.vue — 库存

### 结构

顶部区域自上而下**四层**，层间距统一 14px（`mb-3.5`），每层只放本层的内容：

| 层 | 内容 | 元素 |
| --- | --- | --- |
| ① 标题行 | 页面名（`库存` / `盘点`）+ 本页操作 | `<header class="min-h-9">` |
| ② 统计 / 筛选 | 三张可筛选的语义色概览卡 | `grid grid-cols-3` |
| ③ 今日待办 | 数字下面紧跟「是哪几件、怎么处理」 | `TodayTodo`（根元素自带 `mb-3.5`） |
| ④ 搜索 + 位置 | `SearchField` + `LocationChipBar`（吸顶） | |

> **不要跨层混排。** 早先「标题行里塞统计文字」就是反例：同一行里 20px 标题 /
> 13px 按钮 / 12px 统计三种字号挤在一起，再叠上 SVG 基线问题，观感必然乱。
> 现在统计只在 ② 层；多选态下 ②③④ 都隐藏，① 层右侧换成一行纯文本元信息。

1. **标题行**：`min-h-9`（36px 定高），三种模式（常规 / 多选 / 盘点）下高度一致，切换模式下方内容不跳动。
   右侧操作区是同一个 slot：
   - 常规：齿轮（`.icon-btn`，独立图标用 `md`）+「盘点」「选择」（`.tool-btn`，图标用 `sm`）
   - 多选：`日期 · 在库 N 件`（纯文本元信息，**不配图标**）
   - 盘点：「退出」（`.tool-btn` + `IconText`）
2. **三张可筛选的语义色概览卡**：今日待吃 / 已过期 / 在库。`urgent` / `over` 两张用对应语义色背景，点击即把列表筛到该状态（再点一次取消），选中态用 **2px ring** 而非仅靠颜色
3. **搜索框**：`SearchField`（40px 胶囊），支持本名 + 字典标准名 + **别名**匹配
4. **位置筛选**：`LocationChipBar`，包在 `.filter-sticky` 里**吸顶**（`top: -1px` 贴死容器顶边，负边距铺满整宽）
5. **分组卡片列表**：`groupByFreshness` 切成 紧急待吃 / 临期 / 新鲜 / 未设保质期 四段。**每段必须是独立 `<section class="group">`**（sticky 受包含块约束，旧标题才会被新分组顶出去，而不是叠在同一位置）。分组头同样吸顶，`top` 由本页 ResizeObserver **实测筛选条高度 - 1px** 注入（内联 style）—— 不能写死，chip 换行 / 字体缩放都会改变筛选条高度
6. **段头计数按「份」**：`b.rows.reduce((s, r) => s + r.group.members.length, 0)`。
   列表按组折叠，但用户对「我有几盒牛奶」的认知是份数，只显示组数会让他以为数据丢了

### ★ v3：折叠必须在分段之前

```ts
const itemGroups = computed(() => foldItems(rows.value.map((r) => r.item), foodKeyOf));
const foldedRows = computed(() => sortByFreshness(itemGroups.value.map((g) => {
  const f = freshnessOf(g.lead, today, settings.settings);   // ← 一律看 lead
  return { group: g, f, state: f.state, remainDays: f.remainDays, sortKey: f.sortKey, name: g.name };
})));
const sections = computed(() => (viewMode.value === 'timeline'
  ? groupByTimeline(foldedRows.value)
  : groupByFreshness(foldedRows.value)));
```

> `flat`（不分组）时返回**单个空 label 的段**，模板用 `v-if="sec.label"` 不渲染段头，
> 仍走同一条 `v-for` 路径，不单开一套模板。

⚠️ **先分段再折叠是错的**：同名组会被切到两个段落（10-08 那份在「临期」、10-15 那份在
「新鲜」），同一物品在两处重复出现 —— 这是本轮开发里最不能接受的错。正确顺序永远是
`foldItems → sortByFreshness → groupBy*`。

### ★ 展示方式由设置决定，不由页面 Tab 决定

| `stockViewMode` | 分段函数 | 说明 |
| --- | --- | --- |
| `group`（默认） | `groupByFreshness` | 紧急待吃 / 临期 / 新鲜 / 未设保质期 |
| `timeline` | `groupByTimeline` | 已过期 / 今天 / 明天 / 2–7 天 / 更晚 / 无到期日 |
| `flat` | 不分段 | 平铺，仍按新鲜度排序 |

三选一而**不是**「分组开关 + 时间轴开关」两个布尔：两者是同一份列表的两种切法，
互斥；做成两个开关会出现「都开 / 都关」两种无意义状态，而 `flat` 正好就是「都不启用」那一档。

值来自 `settings.settings.stockViewMode`，由 `stores/settings.normalizeSettings` 保证合法
（旧数据与旧备份里没有该字段，回落 `'group'`），页面可直接比较、不必再兜底。

**库存页右上角没有常驻视图按钮**，取而代之的是一个齿轮图标（进 `/settings`）。
它排在「盘点 / 选择」**之前**：右边缘是右手拇指最自然的落点，留给高频的「选择」；
齿轮是低频配置入口，往左挪一档降低误触。多选态（`?select=1`）与盘点态（`?check=1`）下
齿轮隐藏 —— 与既有「操作态隐藏非必要入口」规则一致。

### 其余两个模式开关（走 route query）

| 开关 | query | 说明 |
| --- | --- | --- |
| 多选 | `?select=1` | `TabLayout` 据此隐藏 FAB、底部多留 132px |
| 盘点 | `?check=1` | `TabLayout` 隐藏 FAB，页面渲染 `StocktakePanel` |

`groupTop`（分组头吸顶偏移）在 `selectMode || stocktakeMode` 时返回 `'-1px'` ——
筛选条在两种模式下都被 `v-if` 移除了，偏移量必须同步变（坑位 #30）。

### 组卡消耗

单份组卡点 ✓/✕ 走 `items.consume` 一步完成；多份走 `GroupConsumeSheet`，
确认后调 `items.consumeGroup(memberIds, type, qty)`（内部 `planGroupConsume` + 单事务
`bulkPut`）再 `undoBulk` 挂撤销。**FEFO 的默认选择与警告都在弹层里**，页面不重复实现。

页面顶部有一个 16px 高的占位 `<div>`：TabLayout 给本页把滚动容器的上内边距置 0（`pt-0`），间距改由普通流内元素提供，sticky 才能严格贴到容器顶边（容器 `padding` 会让吸顶条与顶边之间漏出一条缝）。详见 `src/styles/README.md` 的「吸顶层」。

### 概览卡筛选怎么工作

```ts
const statusFilter = ref<FreshGroup | 'overdue' | null>(null);
```

- `FreshGroup`（`'urgent' \| 'soon' \| 'fresh' \| 'none'`）→ 走 `groupByFreshness` 后只留该组；
- `'overdue'` → 单独筛 `state === 'over'`（因为 `over` 在分组里是并进 `urgent` 的，但「已过期」这张卡要精确只显示过期项）；
- `null` → 不筛。

### 快捷消耗（一步完成，不必进详情页）

卡片右侧的 ✓ / ✕ 直接 emit `consume`，本页调 `items.consume(id, type)` 并 toast。这是全 App 最高频的收尾动作，原来需要「列表 → 详情 → 用掉 → 返回」四步。

**部分消耗**：当该条目 `quantity > 1` 时，不直接消耗整条，而是弹出 `ConsumeSheet` 让用户选本次用掉/扔掉的数量（默认 1，含「全部」快捷）。`qty` 小于剩余量时只扣数量、状态保持 `in_stock`；等于全部时才置 `finished`。`quantity === 1` 时省略弹层、一步 + Toast 撤销。

```ts
// 数量多于 1：先弹数量选择
const logId = await items.consume(item.id, type, qty);   // qty 缺省 = 全部
show(`已记录用掉：${qty} ${item.unit}：${item.name}`, 2200, { text: '撤销', run: () => items.undoConsume(logId) });
```

一步操作带来误触风险，所以**必须同时给撤销**：`consume()` 返回日志 id，`undoConsume()` 回滚（部分消耗会回加数量）。

### 别名搜索（别简化成纯 `includes`）

```ts
function matchName(name: string, kw: string): boolean {
  if (name.toLowerCase().includes(kw)) return true;
  const f = lookupFood(name);                       // 查内置字典
  if (f) {
    if (normalizeName(f.key).includes(kw)) return true;
    if (f.aliases.some((a) => normalizeName(a).includes(kw))) return true;
  }
  return false;
}
```

搜「番茄」能找到存的「西红柿」，靠的就是这条链。**删掉别名匹配会丢高频功能。**

### 关键实现

```ts
const rows = computed(() => {
  const today = todayStr();
  return sortByFreshness(
    items.active
      .filter(...)
      .map((i) => ({ item: i, ...freshnessOf(i, today, settings.settings) })),
  );
});
```

> ⚠️ 上面的 `rows` 是 v2 的原始单份列表，**v3 起只作为 `foldItems` 的输入**
> （`rows.value.map(r => r.item)`），不再直接渲染。要改列表渲染请先看上一节的
> 「折叠必须在分段之前」。

> ⚠️ `today` 是**在 setup 里求值一次**的常量。App 长期挂在后台跨零点后不会自动重算 —— 这是已知限制，刷新页面即可。别把它改成 `computed` 而不改其他地方，会造成同页面两种「今天」。

---

## SettingsView.vue — 设置

> 页面标题是**「设置」**（不是「提醒设置」）：它现在承载多个分区。
> 「我的」页的入口文案同步为「设置」，新增分区往这里加。

| 分区 | 内容 |
| --- | --- |
| **库存设置** | 列表展示方式（按新鲜度 / 按到期日 / 不分组），写 `Settings.stockViewMode` |
| 提醒设置 | 提醒开关、每日时间、临期阈值、紧急阈值 |

用互斥三元的**分段控件**（`bg-primary-600 border-primary-600 text-white` vs
`bg-card border-line text-ink-2`），选中项下方显示一行说明文案讲清区别。
全部用 `computed + setter` 直接把 UI 值转成 `settings.patch`。

## ListView.vue — 购物清单

### 两段分组切换（v3）

顶部有「按原因 / 按位置」两段切换：

| 模式 | 分组函数 | 顺序依据 |
| --- | --- | --- |
| 按原因（默认） | `REASON_ORDER` 固定四组 | 注意力优先级：库存 0 → 临期替换 → 易浪费 → 手动 |
| 按位置 | `groupShoppingByLocation`（domain） | **位置管理里的顺序**（逛店动线），「未指定位置」垫底 |

按位置时 `reason` 降为**副标签**（信息还在，只是让位给位置）。

| 组 | 说明 |
| --- | --- |
| `out_of_stock` | 库存 0 |
| `near_expiry` | 临期替换 |
| `frequent_waste` | 易浪费（建议少买） |
| `manual` | 手动添加 |

空组会被过滤掉（`.filter(g => g.items.length > 0)`）。

### 交互

- 勾选 → `shopping.toggle(id)`
- 删除 → `shopping.remove(id)`（自动项 7 天内不再重生）
- 底部输入框手动添加 → `shopping.addManual(name)`
- 清除已购 → `shopping.clearDone()`

### ★ 勾选与展开必须是两个独立动作

```ts
function toggleInbound(s) { openInboundId.value = openInboundId.value === s.id ? null : s.id; }
async function toggleCheck(s) {
  if (s.inboundItemId) { show(`「${s.name}」已入库，请先撤销入库`); return; }
  const wasChecked = s.checked;          // ← s 是点击**前**的快照
  await shopping.toggle(s.id);
  openInboundId.value = wasChecked ? null : s.id;   // 取消则收起，勾选则展开
}
```

曾经把两者挤在一个函数里，`openInboundId` 收起时提前 `return` 把后面的 `toggle` 一起跳过了
—— **第二次点击只收起卡片、勾选原封不动**，表现就是「勾上就取消不了」。
拆开后行为才对称：点一下勾上、再点一下取消，取消后卡片收起、无残留。

两个边界：

- 已入库（`inboundItemId` 非空）的项**不允许**直接取消勾选 —— 物品已在库存里，
  清单再说「没买」就对不上账；想反悔先撤销入库。视觉上勾选框降透明度表示不可改。
- `shopping.toggle` 内部会 `load()` 换掉对象，所以 `s.checked` 是**切换前**的值，
  正好用来判断这次是勾上还是取消。别改成读 store 里的最新值。

`shopping.done` / `doneNotInbound` 都是 `computed`，取消勾选会自动把它移出
「清除」「全部入库」的作用域 —— **两个既有操作不受影响**。

> 建议的生成发生在 `App.vue` 启动流程里（`shopping.generate()`），**不是本页面 triggering**。所以进页面如果没有内容，是规则没命中，不是 bug。

---

## StatsView.vue — **v3**：统计

从「我的 → 统计」进入（`/stats`，`meta: { header: '统计' }`，顶栏由外壳渲染）。
只放**能指导行动**的四类结论，不做仪表盘堆砌。

### 四块内容

| 区块 | 数据源 | 说明 |
| --- | --- | --- |
| 本月概览（4 格） | `monthStats` | 本月入库 / 已消耗 / 扔掉件数 / 扔掉金额 |
| 近 6 月浪费趋势 | `wasteTrend` | 纯 CSS 柱状条，无图表库 |
| 最常浪费 Top 5 | `topWasted` | 点行跳 `/consume-log?name=xxx` |
| 周转天数 + 品类分布 | `turnoverDays` / `categoryDistribution` | 不足样本时显示「数据不足」 |

### ★ 趋势图必须用全局标尺

```ts
const trendMax = computed(() => Math.max(1, ...trend.value.map((p) => p.amount)));
```

**每根柱子各自归一化（`width: p.amount / maxOfThatMonth`）会让趋势图退化成几张
互不相干的柱状图** —— 视觉上「各有高峰」，读不出「在变好还是变坏」。同一组柱子必须
共用一个分母。

### ⚠️ 柱色要用 `var(--state-over-bar)` 而不是工具类

`--state-*-bar` 系列**没有注册进 Tailwind 的 `@theme`**，写成 `bg-over-bar` 工具类
**不会报错，但会静默失效**（元素透明）。要么用 `var(...)` 引用，要么去 `index.css` 的
`@theme inline` 里补注册。同理 `--sunken` 不存在，正确的名字是 `var(--bg-sunken)`。

### 数据不足怎么显示

`wasteTrend` 返回 `[]`、`turnoverDays` 返回 `null` 时，**显示「数据不足」而不是
「0」或空图表**。空图表会被读成「本月没浪费」，那是误导；`0` 会被读成精确结论。
参照 `domain/stats.ts` 里的「数据不足」原则。

### 顶栏不写在本页

与 `ConsumeLogView` 同理：路由登记 `meta: { header: '统计' }`，页面里不要再写
`<NavBar>`，并在顶部放 16–20px 的普通流占位元素。

---

## MeView.vue — 我的

顶部三个数字（本月入库 / 已消耗 / 扔掉金额），中部位置分布条（`locationDistribution`），底部入口：统计（**v3 新增，排在 links 首位**）/ 位置管理 / 保质期字典 / 提醒设置 / 数据备份。

> 「本月」按 `Date.now()` 的月份计算，依赖 `monthStats`。
>
> 「已消耗」指标是可点击的按钮（`<button class="metric metric-btn">`），跳转 `/consume-log`；设置区也增加「消耗明细」入口。

---

## ConsumeLogView.vue — 消耗明细

逐条展示每次「用掉 / 扔掉」的消耗记录，解决「记录写进 `logs` 表但界面上看不到明细」的问题。从「我的」进入（`/consume-log`）。UI 结构对齐 StockView：概览卡 → 吸顶筛选条 → 按天吸顶分组 → 吸底合计。

**顶栏不写在本页**：路由上登记 `meta: { header: '消耗明细' }`，由 `TabLayout` 渲染在滚动容器外面 —— 才能贴死顶部、不随内容滚动，并像底部 Tab 一样占满整宽。因此本页的滚动容器是 `pt-0 pb-0`，顶部 20px 间距由页面内一个 `h-5` 占位元素提供（原因见 `../styles/README.md`「吸顶层」规则 5）。

### 结构

1. **概览卡（`.grid-cols-3`，仅筛选有数据时显示）**：笔数 / 合计金额 / 扔掉金额。`扔掉金额 > 0` 时该卡走 `is-warn` 语义色（同 MeView），向上滚动时随之滚出视口。三张卡与顶栏之间留 20px。
2. **吸顶筛选条（`.filter-sticky`，`top: -1px` 贴死容器顶边、负边距铺满整宽）**，内含三类筛选：
   - 名称搜索：`SearchField`（40px 胶囊，`log.name.includes(kw)`）；
   - 日期：`.wrap-seg` 胶囊（全部 / 今天 / 近 7 天 / 本月 / 今年），按 `log.at` 比对；
   - 类别：`.segment`（全部 / 用掉 / 扔掉），按 `log.type`。
3. **按天分组**：`<section class="group">` 包裹，分组头吸顶 `top` 由本页 ResizeObserver **实测筛选条高度 - 1px** 注入（内联 style）—— 与 StockView 同一套防压半截方案。标题今天 / 昨天 / 具体日期，右侧显示当天条数。
4. **明细卡 `.log-row`**：左侧 3px 色条区分性质（用掉=品牌绿 `is-consumed`、扔掉=危险红 `is-wasted`）。上行 名称 + 类型 tag + 金额（扔掉金额染 `danger`）；中行 时间 / 数量+单位 / 单价；有备注才渲染备注行。

### 字段映射（务必看清口径，两个很容易搞混）

| 列 | 来源 | 说明 |
| --- | --- | --- |
| 名称 | `log.name` | 消耗时的物品名快照 |
| 数量 | `log.quantity` + `log.unit` | **本次实际消耗量**（部分消耗后不再是整条数量） |
| 单价 | `log.unitPrice` | 消耗时的**单价**快照（`null` → 显示「-」） |
| 金额 | `log.price` | **本次金额** = 单价 × 消耗数量（见 `stores/items.consume`）；不是 `unitPrice` |
| 时间 | `log.at` | 相对显示：今天 / 昨天 / `MM-DD HH:mm` |
| 备注 | `log.note` | 物品备注快照；空时不渲染备注行 |

> ⚠️ `log.price` 是「金额」、`log.unitPrice` 才是「单价」，两者语义不同、不要混用或相互覆盖。

### 合计

底部 `.total-bar` **吸底**（`position: sticky; bottom: 0`），显示筛选后「合计（N 笔）」与金额总和（`Σ log.price`，`null` 当 0，最后 `round2` 防浮点）。该条用 `var(--bg-card)` 不透明背景，滚动时盖住列表、不漏内容。它同时是页面的最后一个元素，配合容器 `pb-0` 才能与容器底边齐平（否则下面会露出一条卡片边）。

### 空态

`groups.length === 0` 时显示 `.empty` 占位（文案：没有符合筛选条件的消耗记录），并提供「去添加物资」入口跳 `/stock`。

---

## ItemEditView.vue — 商品新建 / 编辑

同一个组件服务 `/item/new` 与 `/item/:id` 两条路由，靠 `route.params.id === 'new'` 区分。

> ⚠️ 保存按钮有 `saving` 防连点：`items.add` 不去重，手机卡顿时双击会建出两条记录；
> 编辑态第一条已 `router.back()`，第二条照样落库。新增「新建 / 保存」入口时照抄这个守卫。

### ★ 卖点功能：切换位置实时重算到期日

选位置时下方会显示一张对比表（`compareLocations`），列出**每个候选位置的到期日**：

```
冷藏 0–4℃   10-06   7 天   ← 当前
常温阴凉     10-03   4 天
常温通风     10-02   3 天
冰箱冷冻     12-28   90 天
```

让用户直观看到「放冷藏能多放 3 天」。改位置时不要破坏这个 computed。

### 表单字段

| 字段 | 对应 Item 字段 | 说明 |
| --- | --- | --- |
| 名称 | `name` | |
| 数量 / 单位 | `quantity` / `unit` | |
| 位置 | `locationId` | 切换会触发到期日重算 |
| 单价 | `price` | 参与「本月浪费金额」统计 |
| 生产日期 | `producedAt` | 有值时作为保质期起算基准（优先于入库日期） |
| 手填保质期 | `manualShelfLife` | 优先级最高，切位置不覆盖 |
| 备注 | `note` | |

### 操作

- 保存 → `items.save(draft)`
- 用掉了 / 扔掉了 → 数量 > 1 时弹 `ConsumeSheet` 选量，`items.consume(id, type, qty)`；数量 = 1 时一步完成
- 删除 → **先弹 `ConfirmSheet` 确认** → `items.remove(id)`（软删，不写日志），随后 toast 提供**撤销**（`items.restore(snapshot)`）

### 表单分区

「生产日期 / 手填保质期 / 单价 / 备注」四项收进 **「更多选项（可选）」折叠区**（默认折叠，`v-show="moreOpen"`）。它们是低频可选项，默认展开会把高频的名称/数量/位置挤到折叠线以下。

### 边界条件

- **`dict.resolve` 不能写 `.value`**（Pinia setup store 已解包）—— 本文件曾经踩过三次。
- 编辑不存在 id 的商品时 `item` 为 `undefined`，页面应有兜底提示。
- 新建模式 `draft.locationId` 缺省取第一个启用位置。

---

## LocationManageView.vue — 位置管理

| 操作 | 调用 | 限制 |
| --- | --- | --- |
| 上移 / 下移 | `locations.move(id, ±1)` | 首项上移、末项下移静默无效 |
| 启停 | `locations.toggle(id)` | 停用后从 `enabled` 列表消失（筛选栏不再显示），数据保留 |
| 新建 | `locations.create({name, icon, env})` | **名称 ≤ 6 字**（store 层硬截断，UI 也应用 `maxlength`） |
| 删除 | `locations.remove(id, items.list)` | **有在库物品时按钮 `:disabled`**，提示文案由 `domain` 给出；可点开时还要过一层 `ConfirmSheet`（**不可恢复**） |

图标从预设汉字列表 `ICONS` 里选。

---

## DictView.vue — 保质期字典

1. **自定义列表**：当前自定义条目，可「恢复默认」（`dict.reset`）
2. **添加/覆盖表单**：名称 + 环境 + 天数 + 原因 → `dict.upsert`
3. **内置字典浏览**：按品类分组，点击条目**预填表单**（`prefill`）

> ⚠️ **改完字典后如果不调 `items.recomputeAll()`，已有商品的到期日不会更新。** 目前的行为是：重量级场景需要在 save 后显式触发。改动这块时留意。

---

## AppearanceView.vue — 外观与主题

从「我的 → 外观与主题」进入（`/appearance`）。两块能力：

| 能力 | 写入字段 | 说明 |
| --- | --- | --- |
| 主题模式 | `settings.themeMode` | 三档互斥分段：跟随系统 / 浅色 / 深色。`system` 由 `useTheme` 解析成实际值 |
| 主题色 | `settings.accent` | 6 个预设色点 + 自定义（原生 `<input type="color">`，视觉隐藏、由圆形按钮触发） |

### 关键细节

- **选中态 = 外层圆环 + 内层色块**两个元素，不用 `ring` / `ring-offset` —— `ring-offset` 的偏移色默认写死白色，深色模式下会露白边。
- **对勾用白色 SVG**：`resolveAccent` 保证白字在主色上 ≥4.5:1，所以永远看得清。
- **自定义取色**：`input` 事件只调 `theme.preview()`（写 DOM、不落库），`change` 才 `settings.patch` —— 反过来会在一次拖动里写几十次 IndexedDB。**卸载时必须 `theme.refresh()`**，否则没落库的预览色残留。
- **微调提示**：`resolveAccent` 返回 `adjusted: true` 时显示「已自动微调到 xxx」，否则用户以为自己选的色没生效。
- 页面里的**预览卡**（按钮 / 标签 / 徽章 / 开关 / 禁用态）直接用真实组件渲染，换主题色即时生效。
- App.vue 通过 `watch(settings.themeMode/accent) → theme.sync()` 统一落 DOM，本页面只管 `patch`，**不要自己再调 apply**。

---

## SettingsView.vue — 设置

| 设置项 | 字段 | 校验 |
| --- | --- | --- |
| 提醒开关 | `remindEnabled` | switch |
| 每日提醒时间 | `remindHour` / `remindMinute` | `<input type="time">`，解析失败不写入 |
| 临期阈值 | `soonDays` | 必须 > 0 |
| 紧急阈值 | `urgentDays` | 必须 ≥ 0 |

全部用 **computed + setter** 写法，直接把 UI 值转成 `settings.patch`：

```ts
const urgentDays = computed({
  get: () => String(settings.settings.urgentDays),
  set: (v: string) => {
    const n = Number(v);
    if (Number.isFinite(n) && n >= 0) settings.patch({ urgentDays: Math.round(n) });
  },
});
```

阈值变更会立即影响 `freshnessOf` 的判定（因为是 computed 依赖），但 `today` 相关的展示仍需刷新。

---

## BackupView.vue — 备份

| 操作 | 降级策略 |
| --- | --- |
| 导出 · 下载 | `<a download>` 不可用时自动 `copyToClipboard`，再不可用时 toast 报错 |
| 导出 · 复制 JSON | 剪贴板不可用（非安全上下文）时 toast 报错 |
| 导入 · 合并 | `importBackup(data, 'merge')` —— 按 id 合并，冲突取较新 |
| 导入 · 覆盖 | `importBackup(data, 'replace')` —— **清空后整批写入**，选完文件先过 `ConfirmSheet` 才执行 |

**导入后必须 `reloadStores()`** 重新 load 五个 store，否则 UI 显示旧内存状态。

### ★ v1.0.1：覆盖前快照 + 「撤销覆盖」

覆盖导入是「先 `db.wipe()` 再写入」，一旦写错就没有退路。`runImport` 在**调用 `importBackup` 之前**
把当前数据序列化进 `snapshot`（`backupToJson(await buildBackup())`），成功提示带一个 action：

```
已覆盖导入：物品 12 · 位置 6 · 日志 30        [撤销覆盖]
```

点它 → `undoReplace()` 用快照再走一次 `importBackup(snapshot, 'replace')` 并 `reloadStores()`。

- **只在本次会话有效**：`snapshot` 是页面内存里的字符串，离开页面就没了。够用 —— 覆盖是当场发生的。
- 代价是一份 JSON 常驻内存（导出完全量数据），数据量很大时也不该省这一步：**没有它就等于没有退路**。
- `importBackup` 自己还有一道「清洗后物品为 0 就中止」的守卫（见 `../data/README.md`）；快照是第二道。

### ★ v3：如实上报清洗结果

`importBackup` 会在写库前跑 `data/backup/sanitize.ts`（见 `../data/README.md`），
返回的 `sanitized: { dropped, fixed }` 必须**告知用户**：

```
导入完成：物品 12 · 位置 6 · 日志 30
丢弃 2 条无法识别的记录 · 修正 5 条异常字段
```

- **绝不静默清洗**。用户看到「12 条」结果库里有 10 条，会以为数据丢了。
- 提示时长随文案长度调整（纯丢弃/修正的短提示 2600ms，带明细的长提示 4000ms）。
- 清洗的**原则**（能修的修 / 修不了的丢 / 绝不静默）写在 `data/backup/sanitize.ts`
  的文件头注释里，改那里之前先读。

选文件的入口是**可见 `<button>` + 视觉隐藏的 `<input type="file" class="sr-only">`**，由 `pickFile()` 代理 `click()`：

```html
<button class="btn btn-ghost" @click="pickFile">选择备份文件并导入</button>
<input ref="fileInput" type="file" class="sr-only" tabindex="-1" aria-hidden="true" @change="onFile" />
```

> ⚠️ 别改回 `<label>` 包 `display:none` 的 input —— 那样键盘无法聚焦触发（WCAG 2.1.1）。
> `onFile` 里立即 `input.value = ''`，这样重复选同一个文件仍会触发 `change`；File 引用本身仍然有效。

> ⚠️ 这是用户数据的**唯一救生索**（无云同步）。任何削弱它的改动都要三思。

---

## layouts/TabLayout.vue — Tab 外壳

**本项目最需要谨慎修改的文件之一。**

### 职责

- 底部三 Tab（库存 / 清单 / 我的）
- 顶部**纯白无标题**占位（只负责安全区高度 `var(--safe-top) + 12px`，即 `h-[calc(var(--safe-top)+12px)]`）
- **由 `meta.header` 驱动的子页顶栏**：路由带 `meta.header` 时渲染 `NavBar`（在滚动容器外面），并跳过上面那块纯白占位（`NavBar` 自己承担安全区，否则白色多出 12px）
- 右下角 FAB「快速入库」，**只在库存 Tab 显示**
- 承载 `QuickAddSheet`
- 滚动容器的内边距（`padClass`）：
  | 页面 | 类名 | 为什么 |
  | --- | --- | --- |
  | 库存 | `pt-0 pb-[84px]` | 筛选条吸顶要贴顶边；底部给 FAB 让位 |
  | `meta.header` 页面（消耗明细） | `pt-0 pb-0` | 吸顶筛选条贴顶、吸底合计条贴底；上下留白由页面内的占位元素提供 |
  | 其余主 Tab（清单 / 我的） | `pt-4 pb-3` | 常规留白 |

  **给带 sticky 元素的页面加容器 padding 一定会漏内容**（sticky 偏移相对内容盒算），详见 `../styles/README.md`「吸顶层」规则 5。

### ★ 返回键治理

```ts
const isStock = computed(() => route.path.startsWith('/stock'));
const quickAddOpen = computed(() => route.query.quickadd === '1');
function openQuickAdd() { router.push({ path: '/stock', query: { quickadd: '1' } }); }
function closeQuickAdd() { if (route.query.quickadd) router.back(); }
```

```vue
<button v-if="isStock" class="fab" @click="openQuickAdd" aria-label="快速入库"><svg …/></button>
<QuickAddSheet :model-value="quickAddOpen" @update:model-value="closeQuickAdd" />
```

> FAB 内部的加号是**内联 SVG + `currentColor`**，不是全角「＋」字符 —— 后者在不同字体下会变黑、笔画粗细也与其它图标不一致。

完整原理见 `../components/README.md#-返回键治理务必理解后再改`。**任何全屏/半屏弹框都要照抄这个模式。**

### 三条视觉底线

1. 顶栏背景必须是 `#FFFFFF`（不能用品牌绿），主 Tab 且**不显示标题**。
2. `theme-color`（`index.html`）与 manifest `theme_color` 必须同为 `#FFFFFF`，否则状态栏会出现一条绿边。
3. 顶部白色区域高度 = `env(safe-area-inset-top) + 12px`（`meta.header` 页面则由 `NavBar` 的 `48px + 安全区` 承担），让白色延伸到状态栏。

---

## 新增页面的检查清单

- [ ] 在 `src/router/index.ts` 注册（懒加载）
- [ ] 独立子页自己渲染 `<NavBar :title show-back @back="router.back()" />`；主 Tab 加到 TabLayout 下
- [ ] 挂在 TabLayout 下但需要标题栏的页面：路由写 `meta: { header: '标题' }`，页面里**不要**再写 `NavBar`，并在页面顶部放一个 16–20px 的普通流占位元素
- [ ] 业务计算在 `domain/`，数据操作走 store
- [ ] **组件默认导入**（`import X from '@/components/X.vue'`）
- [ ] 无模板可用于屏幕阅读的交互元素都加了 `aria-label`
- [ ] 同步更新了本 README 的路由映射表
- [ ] 同步更新了根 `AGENTS.md`
