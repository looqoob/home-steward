# styles — 设计系统

> **样式方案（2026-09 迁移）**：由「手写 SCSS」切换为 **Tailwind 工具类 + Vant 按需组件**。
> `src/styles/index.css` 是**唯一真源**（CSS 变量 token + Tailwind 入口 + Vant 主题变量）。
> 改视觉从这里开始，组件里不得出现魔法色值；基础组件直接用 Vant，不手写等价物。

## 文件

| 文件 | 职责 |
| --- | --- |
| `index.css` | ① 层序声明 `@layer theme, base, vant, components, utilities;` ② `@import "tailwindcss"` 入口 ③ `:root` 设计 token（颜色/字号/间距/圆角/阴影/环境色/遮罩）④ `html[data-theme='dark']` 深色变量覆盖（**不是** `@media`，原因见「深色模式与主题色」）⑤ Vant 主题变量 `--van-*`（`--van-primary-color` 指向 `var(--primary-600)` 以跟随主题色）⑥ `@theme inline` 把 token 映射成 Tailwind 工具类 ⑦ `@layer base` reset + 全局焦点环 ⑧ `@layer components` 的 Vant 对齐规则（`.van-config-provider{width:100%}`、Vant 组件焦点环）⑨ `.no-scrollbar` / `.sr-only` 两个保留类 |

由 `src/main.ts` 的 `import './styles/index.css'` 引入，**且必须先于 `App.vue` 导入**（见下「层叠分层」）。

## ⚠️ 层叠分层（★ 改样式前必读）

Tailwind 工具类在 `@layer utilities` 里，而 CSS 层叠是「**分层比较先于选择器权重**」：低优先级层里的规则，权重再高也会输给高优先级层。Vant 自带样式含全局元素选择器（`input,button,textarea{color:inherit;font:inherit}`、`*:focus{outline:none}`、`body{font-family:...}`），若不处理会压过所有工具类（症状：按钮/选中 chip 文字变黑、字号字重失效、焦点环消失）。

因此：

1. `vite.config.ts` 的 `vantCssLayer()` 插件把所有 Vant CSS 包进 `@layer vant`，并随文件下发层序声明（构建产物里 Vant CSS 可能排在 `index.css` 之前，层序按「第一次出现」生效）。
2. **不要**把自己的规则写在 unlayered 位置来"覆盖"Vant —— 要写就写进 `@layer components`。
3. 新增第三方 UI 库样式时，同样必须装进一个低于 `utilities` 的层。

## ⚠️ 选中态写法（★ 约定）

chip / 分段控件 / 卡片的选中与未选中配色必须写成**互斥的三元表达式**：

```html
:class="sel ? 'bg-primary-600 border-primary-600 text-white font-medium'
            : 'bg-card border-line text-ink-2'"
```

**不要**「静态类 + 条件类叠加」（如 `class="text-ink-2 bg-card" :class="{'text-white bg-primary-600': sel}"`）——两个同类工具类谁生效取决于它们在生成 CSS 里的先后顺序，Tailwind 升级或换一批类名后顺序就可能反转，选中态随之静默失效。

## ⚠️ 与原型的关系

`index.css` 顶部的 token 值逐字对应 `家庭物资管家-原型-v0.2.html` 的 `:root`。

改任何 token 值之前，**先确认原型是否已同步修改**。否则视觉会逐渐与原型漂移 —— 而「1:1 复刻原型」是本项目的硬性要求。

---

## Token 清单（CSS 变量 + 对应 Tailwind 工具类）

### 主色

| 变量 | 值 | Tailwind 工具类 | 用途 |
| --- | --- | --- | --- |
| `--primary-50` | `#e8f5ef` | `bg-primary-50` | 极浅底 |
| `--primary-100` | `#cfe9dc` | `bg-primary-100` | 浅底 |
| `--primary-500` | `#2e9e6b` | `bg-primary-500` / `text-primary-500` | **品牌绿**（进度条填充、图标） |
| `--primary-600` | `#228055` | `bg-primary-600` / `text-primary-600` | **★ 选中态专用** |
| `--primary-700` | `#1a6442` | `bg-primary-700` | 深压态（浅色）；深色模式提亮为 `#7fc9a5` |

> **易错点**：选中态（chip 激活、Tab 选中、主按钮）用 `600`，**不是 500**。用 500 会明显偏亮、和原型不一样。
>
> **主题色可换**：上表是**默认色板**（`--accent` 未被用户改过时的值）。用户在「外观与主题」里换色后，`useTheme` 会把 `--primary-50…700` / `--focus-ring` / `--accent` 以 inline style 写到 `<html>` 上覆盖这里。新增用到主色的地方**直接引用这些变量**即可自动跟随，不要在组件里另算颜色；也不要在 CSS 里用 `color-mix()` 从主色派生（对比度校正在 JS 里，见 `domain/accent.ts`）。

### 四态语义色（新鲜度）

`domain/freshness` 的 `barColor()` 提供进度条色；徽章的 `bg-*-bg` / `text-*-fg` 由 `ItemCard.vue` 的 `badgeColor` 映射直接取色：

| 状态 | bg 变量 / 工具类 | fg 变量 / 工具类 | bar |
| --- | --- | --- | --- |
| fresh | `--state-fresh-bg` / `bg-fresh-bg` | `--state-fresh-fg` / `text-fresh-fg` | `#2e9e6b` |
| soon | `--state-soon-bg` / `bg-soon-bg` | `--state-soon-fg` / `text-soon-fg` | `#e0952f` |
| urgent | `--state-urgent-bg` / `bg-urgent-bg` | `--state-urgent-fg` / `text-urgent-fg` | `#d9534a` |
| over | `--state-over-bg` / `bg-over-bg` | `--state-over-fg` / `text-over-fg` | `#a9857f` |

### 中性色

| 变量 | 值 | Tailwind 工具类 | 用途 |
| --- | --- | --- | --- |
| `--bg-page` | `#f6f7f6` | `bg-page` | 页面背景 |
| `--bg-card` | `#ffffff` | `bg-card` | 卡片背景 |
| `--bg-sunken` | `#eff2f0` | `bg-sunken` | 内凹区（输入框底等） |
| `--line` | `#e4e8e5` | `border-line` | 分割线 |
| `--line-strong` | `#d2d8d4` | `border-line-strong` | 强调边框 |
| `--text-1` | `#222624` | `text-ink-1` | 主文本 |
| `--text-2` | `#5f6763` | `text-ink-2` | 次要文本 |
| `--text-3` | `#6b736e` | `text-ink-3` | 占位 / 弱化文本（**已按 WCAG 校准，勿改回 `#8b938e`**） |
| `--danger` | `#8e2f27` | `text-danger` / `bg-danger` | 危险操作 |

> **命名约定**：页面底色用 `bg-page` / `bg-card` / `bg-sunken`，文字用 `text-ink-1/2/3`，描边用 `border-line` / `border-line-strong`。不要用 Tailwind 默认 `bg-white` / `text-black` 等硬编码——深色模式靠变量覆盖自动切换。

### 间距 / 圆角 / 阴影 / 动效

- 间距：Tailwind 默认刻度（`p-1`=4px、`p-2`=8px、`p-3`=12px、`p-4`=16px、`p-5`=20px、`p-6`=24px、`p-8`=32px），与旧 `--space-*` 一一对应。
- 圆角：`rounded-sm`=8px、`rounded-md`=12px、`rounded-lg`=16px、`rounded-xl`=16px、`rounded-2xl`=18px、`rounded-3xl`=20px、`rounded-full`=999px（已在 `@theme inline` 覆盖 Tailwind 默认刻度）。
- 阴影：`shadow-card`（`0 1px 2px rgba(20,30,25,.06)`）、`shadow-pop`（`0 6px 24px rgba(20,30,25,.12)`）。
- 动效：`--ease` = `200ms ease`。

### 图标排版（`--ic-*`，完整规范见 `docs/ICON-TEXT-SPEC.md`）

| 变量 | 值 | 对应类 | 用在哪 |
| --- | --- | --- | --- |
| `--ic-xs` | 14px | `.icon-xs` | 12px 小字旁、chip 内 |
| `--ic-sm` | 16px | `.icon-sm`（默认） | **与文字同排**的图标（13–14px 文字） |
| `--ic-md` | 20px | `.icon-md` | 独立图标按钮、导航栏 |
| `--ic-lg` | 24px | `.icon-lg` | FAB |
| `--ic-ill` | 26px | `.icon-ill` | 空状态插画（描边另降到 1.6） |
| `--icon-stroke` | 2.4 | — | viewBox 单位，**恒定，不随尺寸缩放** |
| `--ic-gap-xs/sm/md` | 4 / 6 / 8px | — | 图标 ↔ 文本间距 |

配套类（都在 `@layer components`）：

| 类 | 作用 |
| --- | --- |
| `.icon` | 所有内联 SVG 的基类。**`display: block` 不能删** —— 否则 inline 的 `vertical-align: baseline` 会把图标底边压在文本基线上，图标整体下沉 |
| `.it` | 图标 + 文本容器。`--it-lh` 同时喂给文本 `line-height` 与 `.it-icon` 的 `height`，两边恒等 → 图标光学中心 = 文本行盒中心，**与字号无关** |
| `.it-top` | 多行文本时图标顶部对齐（对齐第一行） |
| `.it-icon` / `.it-text` | 图标盒（`height: calc(1em * var(--it-lh))` 内居中）/ 文本（`min-width: 0`） |
| `.icon-btn` | 纯图标按钮：32×32 盒，`::before { inset: -6px }` 撑 44×44 热区，**不改布局尺寸** |
| `.tool-btn` | 工具栏「图标 + 文字」按钮：32px 高 + 4px 横向内边距，与 `.icon-btn` 同高 |

> SVG 上**不再写** `width` / `height` / `stroke-width`，尺寸与粗细由 `.icon .icon-{档位}` 给。
> 改了文本的 `leading-*` 就要同步改 `--it-lh`（`IconText` 组件传 `:lh`），否则图标会偏。

### 环境色（`--env-*`，位置圆点）

| 变量 / 工具类 | 值 | 环境 | 对白底对比度 |
| --- | --- | --- | --- |
| `--env-chilled` | `#4a8fd4` | 冷藏 0–4℃ | 3.40:1 ✓ |
| `--env-frozen` | `#5b87be` | 冷冻 −18℃ | 3.71:1 ✓ |
| `--env-cool` | `#8c7fa6` | 常温阴凉 | 3.68:1 ✓ |
| `--env-dry` | `#a9823c` | 常温干燥 | 3.53:1 ✓ |
| `--env-ventilated` | `#4f8a6e` | 常温通风 | 4.04:1 ✓ |
| `--env-dark` | `#5e6b78` | 常温避光 | 5.45:1 ✓ |

> **对比度基线**：圆点是「非文本图形」，按 WCAG 1.4.11 需 ≥3:1。
> 2026-09-29 修正了冷冻 / 干燥 / 通风三色（原 2.46 / 2.46 / 2.72 均不达标）。
> **改色时务必同步 `src/domain/types.ts` 的 `ENV_LIST[].color`**，两处是同一组颜色的两份定义。

> UI 里**不要直接写这些色值**，而是走 `@/domain/types` 的 `ENV_MAP[env].color`（`LocationChipBar.vue` 等已用内联 `:style` 注入圆点色）——保证「环境 → 颜色」只有一份定义。

---

## 组件策略：Tailwind + Vant

- **基础组件用 Vant（按需）**：按钮 `van-button`、开关 `van-switch`、`van-config-provider`（深色模式）直接用 Vant。它们由 `vite.config.ts` 的 `Components({ resolvers: [VantResolver()] })` 在编译期自动按需导入，**无需手动 `import`**（见根 `AGENTS.md` §13）。
- **表单类控件一律手写**：输入框用原生 `<input>` + `.field-input` 组件类，label 在上；「标签 + 控件 + 说明」的结构统一包一层 `components/FormField.vue`（`label` / `for-id` / `hint` / `spacing`），搜索框用 `components/SearchField.vue`。**不要用 `van-field` / `van-search`**：它们由 `van-cell` 拼出来，自带两层固定行高与上下内边距，跟设计系统的 40/44px 高度对不齐（图标与占位文字不居中、整框偏高），只能靠一串 `--van-search-*` / `--van-cell-*` 变量去凑。
- **高度自定义部分仍是手写 Tailwind**：`ItemCard.vue`、`LocationChipBar.vue`、`SearchField.vue`、`QuickAddSheet.vue` 的卡片/网格/步进器/底部弹框结构，以及各页面的布局、吸顶筛选、统计数字块等，全部用行内 Tailwind 工具类实现。
- **页面级重复件收进 `@layer components`**：`.section-label`（12px ink-3 小节标题）、`.tip`（sunken 提示盒，变体 `.tip-danger` / `.tip-urgent` / `.tip-soon`）、`.card`（白底 + 1px 描边 + 12px 圆角 + 阴影，`.card-lg` 为 16px 圆角）、`.field-label` / `.field-input` / `.field-textarea` / `.field-hint`（表单字段的四件套外观）。它们替代了此前在 8–19 个文件里各手抄一份的同一串工具类；**内边距 / 外边距仍由调用点的工具类给**（`p-3`、`mb-3.5` 等），条件态（`border-danger`、`mt-5`）因 utilities 层更高可正常覆盖。
- **输入框为什么是 CSS 类而不是 `<AppInput>` 组件**：单价、手填保质期这类字段需要 `:value` + `@input` 走自定义解析（`priceFromInput`、空串转 `null`），做成组件就得为 `v-model` 再造一套 parse/format 协议，反而更绕。外观收敛到 `.field-input`，结构与标签交给 `<FormField>`。
- **保留的全局类**：`.no-scrollbar`（隐藏滚动条）、`.sr-only`（视觉隐藏但保留可访问性，用于隐藏的 file input）。需要 `padding` / `pseudo` / `keyframes` 的极少数场景才写 `<style scoped>`。

---

## 深色模式与主题色

**深色变量挂在 `html[data-theme='dark']` 上，不是 `@media (prefers-color-scheme: dark)`。**
媒体查询无法被应用内状态覆盖 —— 用户手选「浅色」但系统是深色时就失效了。`data-theme` 由两处维护：
`index.html` 的内联脚本（首帧前，读 localStorage 镜像 `hs.theme` 防闪烁）+ `composables/useTheme.ts`（运行中）。
`system` 模式在 JS 里已解析成 light/dark。`App.vue` 用 `<van-config-provider :theme="解析值">` 把 Vant 内置暗色一起切。

**主题色同理由 JS 驱动**：用户选的主色经 `domain/accent.ts` 对比度校正后，整条色阶（`--primary-50…700`、`--focus-ring`、`--accent`）写成 `<html>` 的 **inline style**，inline 优先级高于 `:root`，CSS 里的色板只是首帧兜底。

规则：

1. **组件里一律用 `bg-card` / `bg-page` 等工具类或 `var(--bg-card)`，不要硬编码 `#fff`**。硬编码的地方在深色模式下会变成白块。
2. 焦点环用 **`--focus-ring`** 而非 `--primary-700`（主题色可换后由 `accentScale` 保证它对卡片底 ≥3:1）。全局 `:focus-visible` 已统一加好轮廓。
3. **主题色的派生别在 CSS 里做**（`color-mix()` 之类）—— 对比度校正需要「不达标继续调」的闭环，只能在 JS 里算（见 `domain/accent.ts`）。
4. `index.html` 的 `theme-color` **只有一份**，值由 `useTheme` 切换时写入（浅 `#FFFFFF` / 深 `#1C211F`，与 `--bg-card` 一致）。不要改回「两套 meta + `media`」—— 用户手选深色但系统浅色时状态栏会错。
5. **新增深色值要重算对比度**：深色不是反色，`--text-3` 在浅底不达标的值，在深底可能刚好达标，反之亦然。
6. **弹层遮罩用 `bg-mask`**（`--mask` token：浅 `rgba(20,30,25,0.45)` / 深 `rgba(0,0,0,0.6)`），不要写死 `bg-black/40` —— 深色下纯黑 40% 会灰得看不出层次。
7. **语义色不跟随主题色**：环境色与新鲜度四态保持固定，否则「冷藏=蓝、临期=橙」的语义失效。

---

## 布局骨架与吸顶层（库存页）

```
#app                        全屏高度、flex 列、居中（max-w 约束在 TabLayout）
├── 顶栏（主 Tab 纯白无标题 / 由外壳渲染的 NavBar：meta.header 页面，含标题+返回）
├── 可滚动内容区（Tailwind：flex-1 overflow-y-auto no-scrollbar px-4）
└── 底部 Tab（含 safe-bottom）
```

吸顶元素用 Tailwind：`sticky top-[-1px] z-20 bg-page -mx-4 px-4`（筛选条）/ `sticky z-[19] bg-page -mx-4 px-4`（分组头）。

### z-index 阶梯（数值要错开且都低于全局浮层）

```
列表内容 0 < 分组头 19 < 筛选条 20 < FAB 25 < 遮罩 28 < 弹层 29 < toast 60
```

六条硬规则（违反任何一条都会出现「内容从缝里漏出 / 标题被压半截」）：

1. **背景必须不透明且走 `bg-page`**（写死 `bg-white` 深色模式会漂移）。
2. **负边距铺满整宽**（`-mx-4` + 对应 `px-4` 还原缩进），否则内容区左右 16px 留白处会漏出滚过的卡片。
3. **筛选条 `top: -1px`**（多压 1px 消亚像素缝）；**分组头 `top` 用 JS 实测筛选条高度 - 1px**（StockView 的 ResizeObserver），写死像素值会因 chip 换行/字体缩放错位。
4. **每个分组必须是独立 `<section>`**：sticky 被约束在自己的包含块内，分组切换时旧标题才会被「顶」出去；如果所有标题是同一父元素下的兄弟，新标题会叠在旧标题上面。
5. **★ 滚动容器不能给上下 `padding`**（`TabLayout.padClass` 就是按这条分流的）：`sticky` 的偏移量是相对**内容盒**算的，容器 `padding` 会把吸顶条 / 吸底条整体朝内推一个 padding，条与容器边缘之间就留出一条缝，滚动中的卡片会从缝里漏出来（症状：顶栏下方 / 合计条下方露出一条卡片边）。
   - 有 sticky 条的页面 → 容器 `pt-0`（必要时连 `pb-0`），留白改由页面内的**普通流占位元素**提供（`StockView` 顶部的 `h-4` 占位、`ConsumeLogView` 的 `h-5`）。
   - 自检方法：滚到页面中段截图，看顶栏 / 底栏与 sticky 条之间有没有一条露出卡片的高光带。
6. **吸顶条高度别写死**：分组头的 `top` 用 ResizeObserver 实测筛选条高度 - 1px；改完用无头浏览器滚一遍确认。

---

## 触控热区 / 可访问性（保留旧规则）

- **小于 44px 的可点击元素**：用 `min-h-11 min-w-11`（44px）或显式 `min-h-[44px]` 把触控热区撑到 44px（WCAG 2.1 AA Target Size）。视觉尺寸可更小，热区要够大。
- **可点击元素用原生控件**：`<button>` 而非 `div + @click`（自带 Tab 焦点与 Enter/Space 激活）。Vant 组件本身是原生控件。
- **字号 ≥12px**：中文不用 11px。
- **减弱动态效果**：全局已加 `prefers-reduced-motion` 兜底，新增长时间动画需自觉考虑。

---

## 修改 styles 的检查清单

- [ ] 改 token 值 → **先确认原型已同步**（`index.css` 顶部注释）
- [ ] 新增 token → 加进 `:root`，并在 `@theme inline` 里挂上对应的 `--color-*`（否则没有工具类可用），同时更新本文档的清单
- [ ] 组件里**没有魔法色值**（一律用 Tailwind 工具类或 `var(--*)`；环境色走 `ENV_MAP`）
- [ ] 涉及「选中态」用的是 `bg-primary-600`
- [ ] **顶部 / 底部容器处理了 `env(safe-area-inset-*)`**（`NavBar.vue` 用 `pt-[env(safe-area-inset-top,0px)]` + `h-[calc(48px+env(...))]`；`TabLayout` 的底栏与白色占位同理）
- [ ] **带 sticky 条的页面**：滚动容器没有多余的上下 `padding`（见「吸顶层」规则 5）
- [ ] **对比度达标**：正文/辅助文字 ≥4.5:1，圆点等图形 ≥3:1（改 `--text-3` / `--env-*` 时重点复查）
- [ ] **字号 ≥12px**：中文不用 11px
- [ ] **可点击元素用原生控件**（`<button>` / Vant 组件）
- [ ] **深色模式**：新增的背景色走了 `bg-page` / `bg-card` 等变量类，而不是 `bg-white` / `#fff`
- [ ] **动效**：没有新增长时间动画，或已考虑 `prefers-reduced-motion`
- [ ] 同步更新了根 `AGENTS.md`（技术栈表、§6.1、§13、改动场景导航）
