# components — 可复用 UI 组件

> **导入方式（重要）**：`<script setup>` 只暴露 default 导出，**必须默认导入**：
> ```ts
> import ItemCard from '@/components/ItemCard.vue';      // ✅
> import { ItemCard } from '@/components/ItemCard.vue';  // ❌ 构建报 [MISSING_EXPORT]
> ```
>
> 组件**不做业务计算**：涉及日期、保质期、新鲜度的，一律调 `domain/`。组件只负责渲染和发事件。

## 组件一览

| 组件 | 用途 | 使用页面 |
| --- | --- | --- |
| `ItemCard.vue` | 商品卡片：图标、名称、新鲜度徽章、数量、位置标签、进度条 | StockView、ItemEditView |
| `ItemGroupCard.vue` | **v3**：同名折叠组卡（组卡头 + 展开后的各份明细），取代 `ItemCard` 成为库存列表主体 | StockView |
| `LocationChipBar.vue` | 位置横滑筛选 chips（含「全部」「管理」） | StockView |
| `NavBar.vue` | 子页顶栏：标题 + 返回按钮 | 独立子页 + `meta.header` 页面（由 TabLayout 渲染） |
| `SearchField.vue` | 列表页搜索框：胶囊外框 + 放大镜 + 原生 input | StockView、ConsumeLogView |
| `QuickAddSheet.vue` | 快速入库底部弹框 | TabLayout |
| `ConfirmSheet.vue` | 二次确认弹层：标题 + 说明 + 取消/确认，危险操作用实心红 | ItemEditView、LocationManageView、BackupView |
| `ConsumeSheet.vue` | 部分消耗弹层：选择本次用掉/扔掉的数量（默认 1，含「全部」） | StockView、ItemEditView、TodayTodo |
| `GroupConsumeSheet.vue` | **v3**：一组多份时的「选份」弹层（FEFO 默认选中最早到期那份 + 越序警告） | StockView |
| `StocktakePanel.vue` | **v3**：盘点模式面板（逐张核对：还在 / 用掉了 / 扔掉了） | StockView |
| `BottomSheet.vue` | 底部弹层外壳：遮罩、Esc/点遮罩关闭、焦点管理、可选固定底栏 | 6 个 Sheet |
| `QtyStepper.vue` | 数量步进器：− 输入 ＋，上下限钳制、步长自适应、单位后缀 | 消耗 / 盘点 / 编辑 / 清单 / 扫码 |
| `Pill.vue` / `PillGroup.vue` | 胶囊筛选按钮与容器：选中态、环境色点、`aria-pressed`、换行/横滑布局 | 12 个页面 |
| `FormField.vue` | 表单字段结构：标签 + 控件 + 说明，配合 `.field-input` 组件类 | 8 个页面 |
| `PageShell.vue` | 二级页外壳：NavBar + 返回 + 可滚动内容区（含 `padding` 预置） | 7 个独立页 |
| `PageHeader.vue` | Tab 页页内标题行：标题 + 右侧操作，自带顶部 16px 占位 | StockView、ListView、MeView |
| `StatCard.vue` | 统计数字卡：20px 数字 + 12px 标签，`tone` 语义色、`clickable` 可点击筛选 | StockView、MeView、StatsView、ConsumeLogView |
| `EmptyState.vue` | 空状态：可选 `#icon` 插画 + 文案 + 可选 `#action` 按钮 | 6 处列表 / 详情 |
| `BottomSheet.vue` | 底部弹层外壳：遮罩、Esc/点遮罩关闭、焦点管理、可选固定底栏 | 6 个 Sheet |
| `QtyStepper.vue` | 数量步进器：− 输入 ＋，上下限钳制、步长自适应、单位后缀 | 消耗 / 盘点 / 编辑 / 清单 / 扫码 |
| `Pill.vue` / `PillGroup.vue` | 胶囊筛选按钮与容器：选中态、环境色点、`aria-pressed`、换行/横滑布局 | 12 个页面 |
| `FormField.vue` | 表单字段结构：标签 + 控件 + 说明，配合 `.field-input` 组件类 | 8 个页面 |
| `PageShell.vue` | 二级页外壳：NavBar + 返回 + 可滚动内容区（含 `padding` 预置） | 7 个独立页 |
| `PageHeader.vue` | Tab 页页内标题行：标题 + 右侧操作，自带顶部 16px 占位 | StockView、ListView、MeView |
| `TodayTodo.vue` | **v2**：今日待办折叠区块，逐条「用掉/扔掉/明天再说」 | StockView |
| `ShoppingInboundRow.vue` | **v2**：清单项的行内入库卡（数量/单价/位置/到期日预览）。**v3**：单价预填「上次买这个的价格」 | ListView |
| `BulkActionBar.vue` | **v2**：多选态吸底操作条（用掉/扔掉/换位置/删除） | StockView |
| `LocationPickerSheet.vue` | **v2**：选择存放位置的弹层，带到期日预览 | StockView |
| `ScanSheet.vue` | **v2**：扫码入库弹层（动态加载 html5-qrcode）。**v3**：教一次时顺带记住单价，下次扫到自动带出 | TabLayout |

> v2 组件的坑位与设计取舍见 [`docs/V2-CHANGELOG.md`](../../docs/V2-CHANGELOG.md)；
> v3 组件见 [`docs/V3-CHANGELOG.md`](../../docs/V3-CHANGELOG.md)。

---

## ItemGroupCard.vue — **v3**：同名折叠组卡

v3 起库存列表的**主体卡片**（`ItemCard` 退居详情页 / 待办里的单份场景）。
数据来自 `domain/grouping` 的 `ItemGroup`：一组 = 同名 + 同位置 + 多个批次。

### Props

| 名 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `group` | `ItemGroup` | ✅ | — | 折叠组（`foldItems` 的产物） |
| `location` | `Location` | ❌ | `undefined` | 传入则显示位置标签（灰底 + 环境色圆点） |
| `selectable` | `boolean` | ❌ | `false` | 多选模式。左侧出现复选框、右侧快捷按钮隐藏 |
| `selected` | `boolean` | ❌ | `false` | 是否已选中（描边 + 浅色环） |

### Emits

| 事件 | 载荷 | 触发时机 |
| --- | --- | --- |
| `open` | `(item: Item)` | 点击卡头进详情页（进的是 `group.lead`）。`selectable` 时改为切换选中 |
| `consume-group` | `(group, type)` | **v3**：只有一份时点右侧 ✓/✕，一步完成 |
| `consume-one` | `(item, type)` | **v3**：多份时点某一行的 ✓/✕，只扣那一份 |
| `select` | `(group)` | `selectable` 时点击卡头切换整组选中 |
| `longpress` | `(group)` | `selectable` 时长按 500ms 进入多选并**全选整组** |

### ★ 三个必须保持的口径

1. **状态色 / 徽标 / 进度条一律取 `leadFresh`（`freshnessOf(group.lead, …)`）**，
   不逐份算完再平均或取最优 —— 否则会出现「名字是西红柿、颜色按番茄」。
2. **长按 500ms + 10px 位移容差**（与 `ItemCard` 同一套手感）。组卡取代 `ItemCard`
   之后这个入口**必须跟着搬过来**，否则 v2 的「长按多选」会静默消失。
3. **`dueSummary` 单份组不写「共 1 份」**。绝大多数物品没有同名邻居，写「共 1 份」是纯
   噪音，还会让「牛奶 1 盒」看起来像是被合并过：

   | 情况 | 文案 |
   | --- | --- |
   | 单份 · 有到期日 | `10-08 到期` |
   | 单份 · 无到期日 | **空串**（什么都不写） |
   | 多份 · 全部有日期且同一天 | `10-08 到期` |
   | 多份 · 全部有日期但不同 | `最早 10-08 到期` |
   | 多份 · 部分无日期 | `共 3 份`（「最早」无从谈起） |

### 单价：多份给区间，不取平均

| 情况 | 文案 |
| --- | --- |
| 全部没填价 | **空串**（什么都不写，与 `ItemCard` 同口径） |
| 各份单价一致 | `¥1.5/个` |
| 各份单价不同 | `¥1.5–2/个` |

展开后的**每份各自显示自己的单价** —— 两次买入价格不同很正常，混成一个数反而失真。
多份时给区间而不是取平均或取 lead：平均会算出一个谁都没买过的价格，
取 lead 会让后面几份的价格凭空消失。

### 展开策略

```ts
const expanded = ref(props.group.members.length <= 2);
```

**≤ 2 份默认展开**（两份一眼能看完），**> 2 份默认折叠**（先看卡头再决定要不要展开）；
全部展开会把长列表撑爆，全部折叠则多一次无谓点击。

⚠️ 展开状态**不持久化**（刷新回默认），避免多一个要同步的本地状态。

### 结构

```
<article>                                 ← 外层不能是 <button>：内部还有展开按钮
  <button class="card-hit">…组卡头…</button>   ← 缩略图 + 名称 + 份数 + 摘要 + 进度条
  <div class="card-actions">
    <button class="act consume">✓</button>   ← 单份时一步完成；多份时开 GroupConsumeSheet
    <button class="act waste">✕</button>
  </div>
  <div v-if="expanded && members.length > 1">…各份明细行（每行带 ✓/✕）…</div>
</article>
```

- `card-hit` 内部一律用 `<span>`（button 只应包含 phrasing content）。
- 两个 `.act` 视觉 36px、`gap: 10px`，`tap-target(44px)` 的热区才不互相重叠。
- 展开区用 `border-t border-line` 与卡头分隔，`aria-expanded` 标在展开按钮上。

### 示例

```vue
<ItemGroupCard
  v-for="row in foldedRows"
  :key="row.group.key"
  :group="row.group"
  :location="locMap[row.group.locationId]"
  @open="router.push(`/item/${$event.id}`)"
  @consume-group="confirmGroupConsume"
  @consume-one="(item, type) => items.consume(item.id, type)"
/>
```

---

## IconText.vue — 图标 + 文本排版原语

把「图标 + 文本」的尺寸、间距、垂直对齐收成一个可复用单元。
**完整规范在 `docs/ICON-TEXT-SPEC.md`**，这里只讲用法。

### Props

| 名称 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `lh` | `number` | `1.6` | 文本行高倍数，**必须与文本实际 `line-height` 一致** |
| `gap` | `number` | `6` | 图标与文本间距（px） |
| `top` | `boolean` | `false` | 多行文本时图标顶部对齐（对齐第一行） |

### Slots

| 名称 | 说明 |
| --- | --- |
| `icon` | 图标。必须自带档位类（`.icon .icon-sm` 等），组件不猜尺寸 |
| default | 文本 |

### ★ 三个必须保持的点

1. **`lh` 必须等于文本实际行高。** 它同时喂给文本的 `line-height` 和图标盒的 `height`，
   两边相等才能保证「图标光学中心 = 文本行盒中心」。外部挂了 `leading-[1.2]` 就要传 `:lh="1.2"`。
2. **与文字同排用 `sm`(16)，独立成按钮用 `md`(20)。** 所以同一行工具栏里齿轮是 `md`、
   「盘点」「选择」的图标是 `sm` —— 这是有意的。
3. **多行文本必须传 `top`。** 默认 `align-items: center` 会让图标相对整块内容居中。

### 示例

```vue
<button type="button" class="tool-btn text-ink-3" :disabled="total === 0" @click="enterStocktake">
  <IconText>
    <template #icon>
      <svg class="icon icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor"
           stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <rect x="4.5" y="4.5" width="15" height="16" rx="2" />
        <path d="M8.6 12.6l2.2 2.2 4.6-4.6" />
      </svg>
    </template>
    盘点
  </IconText>
</button>
```

不用组件时，直接挂 `.it` / `.it-icon` / `.it-text` 三个类，规则完全相同。

---

## ItemCard.vue

一行商品信息，`domain/freshness` 的视觉载体。

### Props

| 名 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `item` | `Item` | ✅ | — | 商品数据 |
| `location` | `Location` | ❌ | `undefined` | 传入则显示位置标签（灰底 + 环境色圆点） |
| `selectable` | `boolean` | ❌ | `false` | **v2**：多选模式。左侧出现复选框、右侧快捷按钮隐藏、整卡改为切换选中 |
| `selected` | `boolean` | ❌ | `false` | **v2**：是否已选中（描边 + 浅色环） |

### Emits

| 事件 | 载荷 | 触发时机 |
| --- | --- | --- |
| `click` | `(item: Item)` | 点击卡片主操作区（进详情页）。`selectable` 时改为切换选中 |
| `consume` | `(item: Item, type: ConsumeType)` | 点击右侧「用掉 / 扔掉」快捷按钮（多选态下不渲染） |
| `select` | `(item: Item)` | **v2**：`selectable` 时点击卡片切换选中 |
| `longpress` | `(item: Item)` | **v2**：`selectable` 时长按 500ms 进入多选并选中该项 |

### v3：单卡显示单价

数量后面跟一句 `¥1.5/斤`，文案由 `domain/price.unitPriceText` 统一生成。

⚠️ **没填价时什么都不显示**（返回空串）。卡片已经很密，「未填价」三个字会抢走到期日
的注意力，而它的信息量是零。需要区分「没填价 vs 真的免费」的是统计页，那里靠脚注说明。

### ★ 长按防误触（v2）

进入多选的第二条路径是长按，但**必须同时监听 `pointermove`**：
```
pointerdown → 启动 500ms 计时
pointermove → 位移 > 10px 则取消计时（用户想滚动，不是想选中）
pointerup / pointercancel / pointerleave → 取消计时
```

漏掉 `pointermove` 的话，在列表上按住并滑动（想滚动）会逐张误触选中。

### ★ 结构约束（改之前先看）

```
<article class="card">
  <button class="card-hit">…缩略图 + 文字 + 进度条…</button>   ← 主操作
  <div class="card-actions">
    <button class="act consume">✓</button>                    ← 用掉了
    <button class="act waste">✕</button>                      ← 扔掉了
  </div>
</article>
```

- **整卡不能是 `<button>`**：内部还有两个按钮，嵌套交互元素非法。主操作区用 `<button class="card-hit">`，外层是 `<article>`。
- **`card-hit` 内部一律用 `<span>`**（button 只应包含 phrasing content）。因此 `.card .main` / `.bar` 在 CSS 里显式声明了 `display: block`。
- 两个 `.act` 视觉 36px、`gap: 10px`，`tap-target(44px)` 的热区才不会互相重叠 —— **别把间距改小**，否则容易误触「扔掉」。

### 行为细节

- 内部自己调 `freshnessOf(item, today, settings)`，**调用方不需要预先算好**。
- 数量显示：整数直接显示，小数保留 2 位再去掉尾零（`1.5 斤` / `2 个`）。
- `icon` 为空时回退显示名称首字符。
- `notRecommended` 为 true 时额外显示「不建议存放」标签。
- **进度条只在 `f.progress !== null` 时渲染**（即：有到期日才显示）。`warn` / `none` 状态不渲染进度条。

### 示例

```vue
<ItemCard
  v-for="i in rows"
  :key="i.id"
  :item="i"
  :location="locMap[i.locationId]"
  @click="router.push(`/item/${$event.id}`)"
  @consume="(item, type) => items.consume(item.id, type)"
/>
```

---

## LocationChipBar.vue

横向滚动的位置筛选栏。`v-model` 双向绑定选中的位置 id。

### Props

| 名 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `modelValue` | `string \| null` | ✅ | — | 选中的位置 id，`null` = 全部 |
| `showManage` | `boolean` | ❌ | `true` | 是否显示右侧「管理」按钮（`!== false` 为真）。有些页面要隐藏 |

### Emits

| 事件 | 载荷 | 触发时机 |
| --- | --- | --- |
| `update:modelValue` | `(v: string \| null)` | 点击「全部」或任一位置 chip |
| `manage` | `()` | 点击「管理」 |

### 行为细节

- **只显示 `locations.enabled`**（停用位置不出现在筛选栏）。
- 每个 chip 上显示该位置的**在库数量**，实时从 `items.active` 过滤统计。
- 已选 chip 的选中样式见 `src/styles/index.css`（注意：选中态用 `bg-primary-600`，不是 500）。
- 位置标签样式是**中性灰底 + 彩色圆点**，圆点类取 `ENV_MAP[env].dotClass`，颜色取 `ENV_MAP[env].color`。

### 示例

```vue
<LocationChipBar v-model="filterLoc" @manage="router.push('/locations')" />
<LocationChipBar v-model="locId" :show-manage="false" />
```

---

## NavBar.vue

子页顶栏。两种用法：

1. **独立路由页面自己渲染**（`/item/:id`、`/locations`、`/dict`、`/settings`、`/backup`）——它是页面根容器（`flex flex-col h-full`）的首个 flex item。
2. **TabLayout 外壳渲染**（路由带 `meta.header`，如 `/consume-log`）——由外壳放在滚动容器**外面**，页面里不要再写 `<NavBar>`，否则会出现两条顶栏。

> 为什么方案 2 必须由外壳渲染：页面渲染的顶栏在滚动容器**内部**，会跟着内容滚走、还被容器的 `px-4` 左右缩进。放在容器外才能贴死顶部并像底部 Tab 一样占满整宽。

### Props

| 名 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `title` | `string` | ✅ | — | 标题文字 |
| `showBack` | `boolean` | ❌ | `false` | 是否显示左侧返回箭头 |

### Emits

| 事件 | 载荷 | 触发时机 |
| --- | --- | --- |
| `back` | `()` | 点击返回按钮 |

### 行为细节

- **不含返回逻辑**，只 emit `back`。返回动作由调用方决定（`router.back()` 或特定路由）。
- 返回按钮带 `aria-label="返回"`，是无障碍要求。
- **安全区处理（别删）**：`pt-[var(--safe-top)]` + `h-[calc(48px+var(--safe-top))]`。标题行的可视高度恒为 48px，安全区在它**之上**额外撑开，否则 APK（edge-to-edge）下标题与返回按钮会被状态栏压住。
  - ⚠️ **这里只能写 `var(--safe-top)`，不能写 `env(safe-area-inset-top, 0px)`**：后者在 Android WebView 里恒为 0（只反映刘海 / 挖孔，不反映状态栏），写了等于没写 —— 这是 `v3` 修过的真实 bug（返回按钮点不到）。
  - `--safe-top` 由 `src/composables/useSafeArea.ts` 在 `main.ts` 挂载前写入 `<html>` 的 inline style；`index.css` 里那份 `env(...)` 只是首帧兜底。普通浏览器里它通常为 0，等于 `h-12`，桌面端视觉不变。
- 由外壳渲染时（方案 2），`TabLayout` **不再**渲染那块 12px 的纯白安全区占位，避免白色区域多出一截。

### 示例

```vue
<!-- 独立子页 -->
<NavBar title="设置" show-back @back="router.back()" />

<!-- TabLayout 内（页面里不写 NavBar，只登记路由 meta） -->
{ path: 'consume-log', component: () => import('@/views/ConsumeLogView.vue'), meta: { header: '消耗明细' } }
```

---

## SearchField.vue — 列表页搜索框

`v-model` 双向绑定关键字，本模板内部无业务逻辑。

### Props

| 名 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `modelValue` | `string` | ✅ | — | 关键字 |
| `placeholder` | `string` | ❌ | `undefined` | 占位文字，同时作为输入框的 `aria-label` |

### Emits

| 事件 | 载荷 | 触发时机 |
| --- | --- | --- |
| `update:modelValue` | `(v: string)` | 每次输入 |

### 行为细节

- **固定 40px 高（`h-10`）**，图标与输入区都用 `items-center` 真正垂直居中；高度只在本组件一处定义。
- 用**原生 `<input>` + `type="text"` `inputmode="search"`**，不用 `van-search` 也不用 `type="search"`：后者的 `van-cell` 两层内边距会把整框撑高、内容不居中，而 `type="search"` 在 WebKit 上还会带一个不受控的原生清除按钮。
- 焦点可见环由外层容器的 `focus-within:border-primary-500 focus-within:ring-2 focus-within:ring-primary-50` 提供，所以 input 自己关掉了 `outline`。
- 调用方只管外边距（如 `class="mb-3.5"`），**不要再给它套 `max-h` / `overflow`**，高度由组件自己决定。

### 示例

```vue
<SearchField v-model="keyword" class="mb-3.5" placeholder="搜索食材（支持别名，如 番茄）" />
```

---

## QuickAddSheet.vue

快速入库底部弹框。**本项目弹框治理的参考实现**，新增弹框请照抄它的模式。

### Props

| 名 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `modelValue` | `boolean` | ✅ | — | 是否显示。**由父级从 `route.query` 派生，不是局部 ref** |

### Emits

| 事件 | 载荷 | 触发时机 |
| --- | --- | --- |
| `update:modelValue` | `(v: boolean)` | 点击蒙层、点击关闭（父级监听后调 `router.back()`） |

### ★ 返回键治理（务必理解后再改）

弹框的**开合状态由路由 query 驱动**，而不是组件内部的局部 ref：

```ts
// TabLayout.vue
const quickAddOpen = computed(() => route.query.quickadd === '1');
function openQuickAdd() { router.push({ path: '/stock', query: { quickadd: '1' } }); }
function closeQuickAdd() { if (route.query.quickadd) router.back(); }
```

```vue
<QuickAddSheet :model-value="quickAddOpen" @update:model-value="closeQuickAdd" />
```

为什么这么绕：

- 安卓返回键触发 `popstate` → `router.back()`，这个事件**不会通知任何局部 ref**。
- 如果用局部变量控弹框：返回键跳走了页面，`showSheet` 还是 `true`。
- query 驱动后，`router.back()` 只回退这一条历史记录 → **关闭弹框且不跳页**（`path` 恒为 `/stock`）。

**配套约束**：弹框**内部**的跨页跳转必须用 `router.replace`，不用 `push`：

```ts
function goCustom()   { router.replace('/item/new'); }    // ✅
function goLocations(){ router.replace('/locations'); }   // ✅
```

理由有两条：① 不 emit close，避免与父级的 `router.back()` 抢导航；② 不额外压历史记录，返回时不会复现弹框。

### 行为细节

- 打开时（`modelValue` 变 `true`）会 **watch 重置内部状态**：`selected = null`、`qty = 1`、`unit = '个'`、`locId = 第一个启用位置`。
- **实时到期预览**：选完食材和位置后，`note` 计算属性调 `computeExpiry` 给出即时反馈：正常显示「西红柿 · 冷藏 · 7 天，到期日 10-06」；不建议存放时显示原因；查不到保质期时提示去编辑页手填。
- 食材有三个来源，共用同一个 `selected` 状态：
  1. **最近入库**（`recentNames`，在库 + 消耗日志去重，最多 8 个）
  2. **九宫格**（`QUICK_FOODS` 固定 9 项 = 3 行，**不加 `max-h` / `overflow`**：加了会在格子内部挤出一点点滚动条，整块跟着手指动；内容实在过长时由弹框本身的外层 `max-h-[86%] overflow-y-auto` 承担）
  3. **自定义输入**（`customName`，`watch` 里同步给 `selected`；输非空值时九宫格自动取消高亮）
- 数量 stepper 的**中间是 `<input type="number" step="0.5">`**，因此能直接输入 `0.5 斤` 这类值；± 步进用 `Math.round(x*100)/100` 消除浮点尾数。
- 单位：常用单位 chips（`个/袋/斤/瓶/盒`）+ 仍可自由输入的输入框。
- **底部主操作吸底**（`.sheet-foot`，`position: sticky; bottom: 0`），内容再长也不用滚到底才能点。
- `confirm(keepOpen)` 支持**连续录入**：`keepOpen = true` 时保留已选位置，只重置食材、数量**与单价**（连续录入的是不同商品，沿用上一件的价格多半是错的），弹框不关。
- `canAdd` 为 false 时两个按钮都不可用（必须选了食材 + 位置）。
- **v3：单价**（`price: number | null`，元 / 单位）。以前这个弹框根本没有价格字段，
  新建物品单价恒为 `null` → 「浪费金额」统计永远是 ¥0。右侧 `priceTotal` 实时显示
  「合计 = 数量 × 单价」，用来兜住「把整盒总价当成单价填进来」。
  输入框口径走 `priceFromInput`（`min="0"` 挡不住手输 `-5`，`1e999` 会变 `Infinity`）。

### 示例

```vue
<!-- 唯一正确用法：modelValue 从 route.query 派生 -->
<QuickAddSheet :model-value="quickAddOpen" @update:model-value="closeQuickAdd" />
```

---

## ConfirmSheet.vue — 二次确认

破坏性操作（删除、覆盖导入）的统一确认层。**不要为某个页面单独写一个确认弹框。**

### Props

| 名 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `modelValue` | `boolean` | ✅ | — | 是否显示 |
| `title` | `string` | ✅ | — | 标题，如「删除物资」 |
| `message` | `string` | ❌ | `undefined` | 补充说明。**破坏性操作要在这里写清后果** |
| `confirmText` | `string` | ❌ | `'确认'` | 确认按钮文案 |
| `cancelText` | `string` | ❌ | `'取消'` | 取消按钮文案 |
| `danger` | `boolean` | ❌ | `false` | `true` 时确认按钮用 `.btn-danger-solid`（实心红） |

### Emits

| 事件 | 载荷 | 触发时机 |
| --- | --- | --- |
| `update:modelValue` | `(v: boolean)` | 点取消 / 点蒙层 / 按 Esc / 点确认（都会先置 `false`） |
| `confirm` | `()` | 点确认 |

### 行为细节

- 打开后 `nextTick` 把焦点移到**确认按钮**，否则键盘用户还留在背景内容里。
- 监听 `keydown`，**Esc 关闭**；`onBeforeUnmount` 里解绑。
- 用局部 `ref` 而非路由 query 驱动即可 —— 它挂在页面组件内，返回键离开页面时随组件一起卸载，不会残留。

### 示例

```vue
<ConfirmSheet
  v-model="confirmRemove"
  title="删除物资"
  :message="`「${name}」将从库存移除，且不计入消耗统计。`"
  confirm-text="删除"
  danger
  @confirm="removeItem"
/>
```

---

## ConsumeSheet.vue — 部分消耗数量选择

配合「一条物资里有多个单位」的场景（如 20 个鸡蛋一次只用 2 个）。**不要为部分消耗单独写逻辑**，数量选择统一走这个弹层。

### Props

| 名 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `modelValue` | `boolean` | ✅ | — | 是否显示 |
| `name` | `string` | ✅ | — | 物资名，标题里展示「用掉多少个 {name}」 |
| `unit` | `string` | ❌ | `'个'` | 单位 |
| `remaining` | `number` | ✅ | — | 剩余数量，决定「全部」上限与步进 |
| `type` | `'consumed' \| 'wasted'` | ✅ | — | 决定标题文案（用掉 / 扔掉） |

### Emits

| 事件 | 载荷 | 触发时机 |
| --- | --- | --- |
| `update:modelValue` | `(v: boolean)` | 点取消 / 点蒙层 |
| `confirm` | `(qty: number)` | 点确认，**先发 confirm 再发 update:modelValue=false**（顺序不能反，否则父级目标被清空） |

### 行为细节

- 数量 `<input type="number" min="1" :max="remaining" step="1">`，`confirm` 时 `clamp(qty, 1, remaining)`。
- **「全部」按钮**一键填满 `remaining`；`remaining === 1` 时弹层本身不会被唤起（由调用方判断），所以这个按钮始终有意义。
- 与 `ConfirmSheet` 不同，它**用局部 `ref` 驱动**即可，不用路由 query（挂在页面内，返回键随组件卸载）。

### 示例

```vue
<ConsumeSheet
  v-model="consumeOpen"
  :name="target.name"
  :unit="target.unit"
  :remaining="target.quantity"
  :type="consumeType"
  @confirm="doConsume"
/>
```

---

## GroupConsumeSheet.vue — **v3**：多份选份弹层

一组里有多个批次时，「用掉」必须让用户知道**用的是哪一份** —— 这正是 v3 不做真合并
要保住的信息（见 `domain/grouping`）。

### Props

| 名 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `modelValue` | `boolean` | ✅ | 是否显示 |
| `group` | `ItemGroup \| null` | ✅ | 为 `null` 时不渲染内容 |
| `type` | `'consumed' \| 'wasted'` | ✅ | 决定标题文案（用掉 / 扔掉） |

### Emits

| 事件 | 载荷 | 触发时机 |
| --- | --- | --- |
| `update:modelValue` | `(v: boolean)` | 点取消 / 点蒙层 / 确认后关闭 |
| `confirm` | `(items: Item[], quantity: number)` | 点确认。`items` 通常是 1 份；该份不够时由父级顺延到下一份 |

### 行为细节

- **打开时 `pickedId` 重置为 `group.lead.id`**（FEFO 首份，最早到期）——
  默认就是「下一份该吃的」，多数情况下用户直接点确认即可。
- **`fefoWarning`**：只在「选中的是非 FEFO 首份」**且**「首份还剩着」时出现：
  > 还有更早到期的：第 1 份 · 10-08 到期
  「你正在喝 10-15 那盒，而 10-08 那盒还剩 1 盒」这件事必须说出来，否则折叠就白做了。
  - 无日期的组不显示这条（`formatMD('')` 会输出空串），改用组内序号表述。
- 数量步长 `max >= 2 ? 1 : 0.5` —— 剩余量 0.5 斤时步长跟着变小，别让 stepper 一步跨过上限。
- 本次金额 = 选中那份的 `price × qty`，`price === null` 时不显示金额区。
- **用局部 `ref` 驱动**（与 `ConsumeSheet` 一致），不用路由 query —— 它挂在页面组件内，
  返回键随组件卸载。

### ★ 结构约束：滚动区与按钮条必须是兄弟节点

```html
<div class="flex flex-col h-full">
  <div class="flex-1 min-h-0 overflow-y-auto">…份列表…</div>
  <div class="flex-none">…取消 / 确认…</div>
</div>
```

按钮条**不能**放在滚动容器内部用 `sticky bottom-0`（会重演坑位 #29：
容器 padding 让它永远差一个 pb 到不了弹层底边）。`flex-1 min-h-0` 也不能少 ——
没有 `min-h-0`，flex 子项的默认 `min-height: auto` 会让滚动区撑开而不是收缩。

### 示例

```vue
<GroupConsumeSheet
  v-model="groupSheetOpen"
  :group="consumeTarget"
  :type="consumeType"
  @confirm="confirmGroupConsume"
/>
```

---

## StocktakePanel.vue — **v3**：盘点模式

进入盘点后**一屏一卡**、三个按钮走完整个冰箱。入口是 `StockView` 的「盘点」按钮
（`?check=1`），所以 `TabLayout` 也会据此隐藏 FAB。

### Props / Emits

| 名 | 类型 | 说明 |
| --- | --- | --- |
| `rows` | `{ item, f }[]` | 当前**筛选结果**。盘点只判这些，避免判到看不见的项 |
| `exit` (emit) | `()` | 全部判完或用户主动退出 |

### ★ 队列必须是快照

```ts
const queue = ref(props.rows.map((r) => r.item.id));   // 进入时拍一次
const cursor = ref(0);
```

**不能实时读 `props.rows` / `items.active`**：每判定一张就会消耗掉一件，
`items.active` 随之缩短，列表会一边判定一边往前缩，用户会看到「刚判过的又冒出来」。

### 三个动作的语义

| 按钮 | 行为 | 写日志？ |
| --- | --- | --- |
| **还在** | 只推进游标 | ❌ **绝不写** |
| **用掉了** | 整件消耗（`items.consumeGroup([id], 'consumed')`） | ✅ |
| **扔掉了** | 整件消耗（`items.consumeGroup([id], 'wasted')`） | ✅ 计入浪费 |

- 「还在」不写日志是**刻意的**：盘点里绝大多数物品的结果都是「还在」，
  让它走 `consume` 会平白造出一堆「消耗 1 个」的日志，把统计彻底污染。
- 数量 > 1 也**全量消耗、不弹数量选择**：盘点追求「十秒过完整个冰箱」；
  需要部分数量的人退出盘点用普通消耗即可（判定本身幂等，不怕多点一次）。

### 撤销与收尾

- 所有判定共用一个 `mergedOp()` 汇总 → toast 上一个「撤销」按钮**整批回滚**。
- 收尾文案：`核对 N 件，M 件已不在（用掉 X · 扔掉 Y）`；一件没少则
  `核对 N 件，东西都在`（时长 2200ms，带撤销时 4000ms）。
- 进度显示写「3 / 12」而不只是百分比：这是个会走神的长流程，用户需要随时知道还剩几件。
- **中途退出不保留进度**（`queue` / `cursor` / `ops` 都是纯内存 ref，没有落盘）。
  代价是重来一遍，换来的是不用处理「三天前盘了一半的进度到底还算不算」这个 corner case。
- ⚠️ **不要 `watch(props.rows)` 重置队列**：`judge()` 里的 `consumeGroup()` 会 `load()`，
  `rows` 每判定一次都变成新数组 → watcher 在 `judge` 的 await 续体之前触发，把 `cursor` 归零、计数清零，
  表现是「第二件被跳过、进度越盘越少、收尾统计错」。筛选变化请退出重进（`StockView` 会重挂载本组件）。
- `judging` 挡住同一张卡连点两次，否则游标会多前进一格、跳过下一件。

## ScanSheet.vue — 扫码入库的**去重约定**

- 解码回调**按帧触发**（`fps: 10`），必须「忙锁 + 同码时间窗」：`busy` 挡住还没处理完的那几帧，
  `DEDUPE_MS = 1500` 挡住「处理完但镜头还没移开」。缺了这段，扫一次码会入库十几件。
- **先 `stopScanner()` 再 `addMany`**：等落库完再停，中间那几帧已经各入库一次了。
- 未知码跳到「教一次」表单前也要先停扫，否则持续解码会反复重置用户正在填的表单。
- `saveNewMapping` / `saveMappingOnly` 同样用 `busy` 防连点（双击会记两条映射、建两件物品）。

---

## 新增组件的检查清单

- [ ] `<script setup lang="ts">`；样式用 Tailwind 工具类写在元素行内（仅在需要父选择器/伪元素/keyframes 时才写 `<style scoped>`）
- [ ] Props / Emits 都写了类型定义（`defineProps<{...}>()` / `defineEmits<{...}>()`）
- [ ] 业务计算调 `domain/`，数据访问走 store，**没有直接 import `db`/`dexieDb`**
- [ ] 颜色、间距、圆角来自 `src/styles/index.css` 的工具类 / `var(--*)`，没有魔法值
- [ ] 基础组件优先用 Vant（`van-button` / `van-switch` / `van-config-provider`，无需手动 import）；**表单控件一律手写**——输入框用原生 `<input>` + 项目输入样式（`h-11 border border-line-strong rounded-md`，label 在上），搜索用 `SearchField.vue`，**不用 `van-field` / `van-search`**（原因见 `src/styles/README.md`「组件策略」）
- [ ] 选中态配色写成**互斥三元表达式**，不做「静态类 + 条件类叠加」（原因见 `src/styles/README.md`「选中态写法」）
- [ ] 环境色/文案从 `ENV_MAP` 取，没有硬编码
- [ ] 弹框遮罩用 `bg-mask`（`--mask` token），不写死 `bg-black/40`；主色一律引用 `--primary-*` 变量（会跟随用户主题色），不在组件里派生颜色
- [ ] 交互元素有 `aria-label`
- [ ] 如果是弹框：**用了 query 驱动模式**，内部跨页跳转用 `replace`
- [ ] 同步更新了本 README 的表格
- [ ] 同步更新了根 `AGENTS.md`
