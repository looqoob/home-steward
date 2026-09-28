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
| `ItemCard.vue` | 商品卡片：图标、名称、新鲜度徽章、数量、位置标签、进度条 | StockView |
| `LocationChipBar.vue` | 位置横滑筛选 chips（含「全部」「管理」） | StockView |
| `NavBar.vue` | 子页顶栏：标题 + 返回按钮 | 所有子页 |
| `QuickAddSheet.vue` | 快速入库底部弹框 | TabLayout |

---

## ItemCard.vue

一行商品信息，`domain/freshness` 的视觉载体。

### Props

| 名 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `item` | `Item` | ✅ | — | 商品数据 |
| `location` | `Location` | ❌ | `undefined` | 传入则显示位置标签（灰底 + 环境色圆点） |

### Emits

| 事件 | 载荷 | 触发时机 |
| --- | --- | --- |
| `click` | `(item: Item)` | 点击卡片任意位置 |

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
- 已选 chip 的选中样式见 `_tokens.scss`（注意：选中态用 `--primary-600`，不是 500）。
- 位置标签样式是**中性灰底 + 彩色圆点**，圆点类取 `ENV_MAP[env].dotClass`，颜色取 `ENV_MAP[env].color`。

### 示例

```vue
<LocationChipBar v-model="filterLoc" @manage="router.push('/locations')" />
<LocationChipBar v-model="locId" :show-manage="false" />
```

---

## NavBar.vue

子页顶栏。**只用于子页**，三个主 Tab 不用它（它们用 TabLayout 的纯白无标题 `.topbar`）。

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
- **安全区处理**（别删）：负 margin + 等量 padding 让白色延伸到状态栏，避免刘海机型顶部露出背景缝隙：

```scss
margin-top: calc(-1 * env(safe-area-inset-top, 0px));
padding-top: calc(env(safe-area-inset-top, 0px));
height: calc(48px + env(safe-area-inset-top, 0px));
```

### 示例

```vue
<NavBar title="设置" show-back @back="router.back()" />
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
- 食材来自 `QUICK_FOODS`（`builtin.ts` 导出的 9 宫格常用食材）。
- 数量有 stepper（最小 1），单位自由输入，缺省 `'个'`。
- 确认后调 `items.add()` 并弹 toast，随后 emit 关闭。
- `canAdd` 为 false 时确认按钮不可用（必须选了食材 + 位置）。

### 示例

```vue
<!-- 唯一正确用法：modelValue 从 route.query 派生 -->
<QuickAddSheet :model-value="quickAddOpen" @update:model-value="closeQuickAdd" />
```

---

## 新增组件的检查清单

- [ ] `<script setup lang="ts">` + `<style scoped lang="scss">`
- [ ] Props / Emits 都写了类型定义（`defineProps<{...}>()` / `defineEmits<{...}>()`）
- [ ] 业务计算调 `domain/`，数据访问走 store，**没有直接 import `db`/`dexieDb`**
- [ ] 颜色、间距、圆角来自 `styles/_tokens.scss`，没有魔法值
- [ ] 环境色/文案从 `ENV_MAP` 取，没有硬编码
- [ ] 交互元素有 `aria-label`
- [ ] 如果是弹框：**用了 query 驱动模式**，内部跨页跳转用 `replace`
- [ ] 同步更新了本 README 的表格
- [ ] 同步更新了根 `AGENTS.md`
