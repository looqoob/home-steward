# 图标 + 文本排版规范

> 适用范围：全项目所有内联 SVG 图标与其相邻文本。
> 落地位置：token 与类在 `src/styles/index.css`，组件封装在 `src/components/IconText.vue`。
> 首批应用：`src/views/StockView.vue` 顶部区域。

---

## 1. 为什么需要这套规范

改造前统计 35 个图标，得到下面这张表——**尺寸 7 种、描边 6 种**：

| 尺寸 | 描边 | 光学描边（描边 × 尺寸 / 24） |
| --- | --- | --- |
| 16px | 2.4 / 2.0 / 1.9 | 1.60 / 1.33 / 1.27 |
| 20px | 2.4 / 2.2 | 2.00 / 1.83 |
| 22px | 1.9 | 1.74 |
| 18px | 2.6 / 1.8 | 1.95 / 1.35 |
| 14px | 2.4 | 1.40 |
| 24px | 2.4 | 2.40 |
| 26px | 1.6 | 1.73 |

同一个 16px 图标在不同页面有三种粗细，实际线条重量从 1.27px 到 2.40px 差近一倍。

更要命的是**对齐**：SVG 是 inline 元素，默认 `vertical-align: baseline`，浏览器把图标的
**底边**压在文本基线上——而不是让它的光学中心对齐文字。所以图标看起来总是"沉"下去一截，
`items-baseline` 的父容器也救不了（父容器只对齐有基线的文本，图标跟着被拖走）。

---

## 2. 图标尺寸分级

viewBox 统一 `0 0 24 24`（全项目已经是，新增图标不要改）。

| 档位 | 类 | 尺寸 | 典型搭档文字 | 用在哪 |
| --- | --- | --- | --- | --- |
| xs | `.icon-xs` | 14px | 12px | chip 内、小标签 |
| **sm（默认）** | `.icon-sm` | 16px | 13–14px | 行内、表单、列表——**与文字同排的图标一律这档** |
| md | `.icon-md` | 20px | — | 独立图标按钮、导航栏 |
| lg | `.icon-lg` | 24px | — | FAB |
| ill | `.icon-ill` | 26px | — | 空状态插画（**特例**，描边降到 1.6） |

**选档规则只有一条**：图标**是否伴随文字**。与文字同排 → `sm`；独立成按钮 → `md`。
所以同一行工具栏里，齿轮是 `md`、"盘点""选择"的图标是 `sm`，这是有意的，不是笔误。

### 描边宽度

```css
--icon-stroke: 2.4;   /* viewBox 单位，恒定 */
```

**不随尺寸缩放**，与字号同理：图标放大时线条等比变粗，视觉重量才一致。
好处是改尺寸只需换一个类，不用同步改描边——这是本套规范"只记一个数"的关键。

唯一例外是 26px 插画：26px 下 2.4 的描边会糊成一团，且它不与文字竞争，单独降一档。

---

## 3. 图标与文本的间距

约等于图标尺寸的 0.4 倍，取整后：

| 档位 | token | 间距 | Tailwind |
| --- | --- | --- | --- |
| xs / 12px 文字 | `--ic-gap-xs` | 4px | `gap-1` |
| sm / 13–14px 文字 | `--ic-gap-sm` | 6px | `gap-1.5`（默认） |
| md / 15px 以上 | `--ic-gap-md` | 8px | `gap-2` |

`.it` 默认给 6px；需要别的值直接挂 Tailwind 的 `gap-*`（utilities 层压过 components 层）。

---

## 4. 垂直对齐：行高与基线的换算关系

这是整套规范的**核心**，一句话：

> **把图标放进一个"高度 = 1em × 行高倍数"的盒子，图标在盒内居中。**

```css
.it {
  --it-lh: 1.6;                          /* 一个数，同时喂给下面两处 */
  line-height: var(--it-lh);             /* 文本的 line-height  */
}
.it-icon {
  height: calc(1em * var(--it-lh));      /* 图标盒 height       */
  display: flex;
  align-items: center;                   /* 图标在盒内垂直居中   */
}
```

为什么会对齐：

- 文本行盒高度 = `font-size × line-height` = `1em × --it-lh`
- 图标盒高度 = `1em × --it-lh`

**两者恒等**，所以图标中心 = 文本行盒中心，且**与字号无关**——12px、13px、20px 都不用改数字。
这就是"行高与文字基线的关系"：不需要为每个字号手写 `margin-top`，只需要保证
`--it-lh` 和文本实际 `line-height` 是同一个数。

### 三个必须记住的点

1. **`.icon` 里的 `display: block` 不能删。** 它干掉 inline 的基线参与，否则前面第 1 节
   那个"图标下沉"的问题会原样复现。
2. **改了文本的 `leading-*` 就要同步改 `--it-lh`。** 比如 `leading-[1.2]` 的标题旁放图标，
   必须 `:lh="1.2"`，否则图标盒比行盒高，图标看着偏下。
3. **多行文本传 `top`。** 默认 `align-items: center` 会让图标相对整块内容居中（掉到中间）；
   `.it-top` 改成 `flex-start`，图标才对齐**第一行**。

---

## 5. 落地形态

### 5.1 只想要样式

```html
<span class="it">
  <span class="it-icon">
    <svg class="icon icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">…</svg>
  </span>
  <span class="it-text">盘点</span>
</span>
```

注意 SVG 上**不再写** `width` / `height` / `stroke-width`——尺寸和粗细由 `.icon .icon-sm` 给。

### 5.2 想要组件（`IconText.vue`）

```html
<IconText :lh="1.6" :gap="6">
  <template #icon><svg class="icon icon-sm" …>…</svg></template>
  盘点
</IconText>
```

组件做的只是把上面那三个 `span` 包起来，并把 `--it-lh` 的契约显式化成 prop。
多行文本加 `top`：

```html
<IconText top :lh="1.6">…</IconText>
```

### 5.3 纯图标按钮

```html
<button type="button" class="icon-btn" aria-label="设置" @click="…">
  <svg class="icon icon-md" …>…</svg>
</button>
```

`.icon-btn` 是 32×32 的盒子，热区靠 `::before { inset: -6px }` 撑到 **44×44**（WCAG 2.5.5），
**不改布局尺寸**——并排时不会把行撑高。

### 5.4 工具栏按钮（图标 + 文字）

```html
<button type="button" class="tool-btn text-primary-700" @click="…">
  <IconText><template #icon>…</template>选择</IconText>
</button>
```

`.tool-btn` 统一 32px 高 + 4px 横向内边距（只为加大热区），与 `.icon-btn` 同高，
所以一行里混排图标按钮和文字按钮也不会错行。

---

## 6. 场景速查

| 场景 | 图标档位 | 间距 | 容器 | 备注 |
| --- | --- | --- | --- | --- |
| 13px 菜单项 / 列表行 | sm 16 | 6px | `.it` | 默认形态 |
| 12px 小标签 / chip | xs 14 | 4px | `.it` | |
| 按钮（图标 + 文字） | sm 16 | 6px | `.tool-btn` + `.it` | 32px 高 |
| 纯图标按钮 | md 20 | — | `.icon-btn` | 32px 盒 / 44px 热区 |
| 多行文本（标题 + 说明） | sm 16 | 6px | `.it.it-top` | 图标对齐**第一行** |
| 导航栏返回箭头 | md 20 | — | — | 独立图形 |
| FAB | lg 24 | — | — | |
| 空状态插画 | ill 26 | — | — | 描边 1.6，不与文字同排 |
| 图标在文字**上方**（底部标签栏） | — | — | — | **不在本规范范围**，是纵向堆叠，按原样维护 |
| 纯文本元信息（如"10月6日 · 在库 12 件"） | 无图标 | — | — | 统计信息不加图标，避免噪音 |

---

## 7. 迁移清单

### 第 1 波（已完成）

- 35 个存量图标：`width` / `height` / `stroke-width` 三个属性全部移除，换成
  `.icon .icon-{档位}`。描边 1.9 / 2.0 / 2.2 / 1.8 / 2.6 统一收敛到 2.4，
  尺寸 18 / 22 收敛到 20。
- `StockView` 顶部区域按四层重构，并率先用上 `IconText` / `.icon-btn` / `.tool-btn`。

### 第 2 波（后续逐个页面做）

把**已经在用 `.icon` 但还在手写 `flex items-center gap-x` 的容器**换成 `.it`，
让行高真正走 `--it-lh`。按下面的优先级：

| 优先级 | 位置 | 现状 | 改法 |
| --- | --- | --- | --- |
| 高 | `MeView` 备份提醒条 | `flex items-center gap-2` + 16px 图标 | 换成 `.it`，12px 文字配 `gap-1` |
| 高 | `SearchField` | `flex items-center gap-2 h-10` + 16px 图标 | 图标侧换 `.it-icon`，行高按 h-10 对齐 |
| 中 | `QuickAddSheet` 两个 `van-button` 内的 `inline-flex gap-1.5` | 按钮内嵌 span | 换成 `IconText`（van-button 内可用） |
| 中 | `ItemEditView` / `ShoppingInboundRow` / `ScanSheet` 步进器 | 16px 图标在圆形按钮里居中 | 保持现状（纯图标按钮，无文字伴随），仅尺寸已统一 |
| 低 | `LocationManageView` 拖拽手柄 | 16px fill 图标 | 保持现状 |

### 第 3 波（可选）

- 把图标抽成 `<BaseIcon name="gear" />` 组件，彻底消灭内联 SVG。
  **前提**：先把图标 path 收进一份注册表。目前图标只用了 20 个左右，做起来不亏，
  但会一次性改动 14 个文件，建议单独开一轮，不要和别的需求混着做。

---

## 8. 检查清单

新增或修改"图标 + 文字"时逐条过：

- [ ] SVG 上没有 `width` / `height` / `stroke-width`（尺寸与粗细由 `.icon .icon-*` 给）
- [ ] SVG 上有 `.icon`（`display: block`，否则图标会沉到基线下）
- [ ] viewBox 是 `0 0 24 24`
- [ ] `--it-lh` 与文本实际 `line-height` 一致（外部挂了 `leading-*` 就要同步传 `:lh`）
- [ ] 多行文本传了 `top`
- [ ] 与文字同排用 `sm`、独立成按钮用 `md`
- [ ] 纯图标按钮带 `aria-label`
- [ ] 装饰性图标带 `aria-hidden="true"`
- [ ] 触摸目标 ≥ 44×44（`.icon-btn` 已自带，文字按钮靠 `min-height: 32px` + 宽度）
