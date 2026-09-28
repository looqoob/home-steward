# styles — 设计系统

> **手写设计系统，不引入任何 UI 组件库**（Vant / Element / Tailwind 都不要）。
> `_tokens.scss` 是**唯一真源**。改视觉从这里开始，组件里不得出现魔法色值。

## 文件

| 文件 | 职责 | 行数 |
| --- | --- | --- |
| `_tokens.scss` | 颜色 / 字体 / 间距 / 圆角 / 阴影 / 环境色 + 3 个 mixin | 84 |
| `base.scss` | reset、全局原子类、`.screen` / `.body` 布局骨架 | 107 |
| `components.scss` | 卡片 / 按钮 / 标签 / Tabbar / Sheet 等组件样式 | 916 |

三个文件由 `src/main.ts` 依次 import（`_tokens` 通过 `@use` 被后两者引入）。

## ⚠️ 与原型的关系

`_tokens.scss` 顶部注释写着：**逐字对应 `家庭物资管家-原型-v0.2.html` 的 `:root`**。

改任何 token 值之前，**先确认原型是否已同步修改**。否则视觉会逐渐与原型漂移 —— 而「1:1 复刻原型」是本项目的硬性要求。

---

## Token 清单

### 字体

```scss
$font-sans: -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif;
```

### 主色

| Token | 值 | 用途 |
| --- | --- | --- |
| `$primary-50` | `#e8f5ef` | 极浅底 |
| `$primary-100` | `#cfe9dc` | 浅底 |
| `$primary-500` | `#2e9e6b` | **品牌绿**（进度条填充、图标） |
| `$primary-600` | `#228055` | **★ 选中态专用** |
| `$primary-700` | `#1a6442` | 深压态 |

> **易错点**：选中态（chip 激活、Tab 选中）用 `600`，**不是 500**。用 500 会明显偏亮、和原型不一样。

### 四态语义色

新鲜度状态 → 背景 / 前景 / 进度条，UI 通过 `domain/freshness` 的 `badgeClass()` / `barColor()` 间接使用：

| 状态 | bg | fg | bar |
| --- | --- | --- | --- |
| fresh | `#e8f5ef` | `#1a6442` | `#2e9e6b` |
| soon | `#fbeeda` | `#7a4e0f` | `#e0952f` |
| urgent | `#fbeae8` | `#8e2f27` | `#d9534a` |
| over | `#f0eae9` | `#6e322e` | `#a9857f` |

对应的 CSS 类：`.b-fresh` / `.b-soon` / `.b-urgent` / `.b-over`。

### 中性色

| Token | 值 | 用途 |
| --- | --- | --- |
| `$bg-page` | `#f6f7f6` | 页面背景 |
| `$bg-card` | `#ffffff` | 卡片背景 |
| `$bg-sunken` | `#eff2f0` | 内凹区（输入框底等） |
| `$line` | `#e4e8e5` | 分割线 |
| `$line-strong` | `#d2d8d4` | 强调边框 |
| `$text-1` | `#222624` | 主文本 |
| `$text-2` | `#5f6763` | 次要文本 |
| `$text-3` | `#8b938e` | 占位 / 弱化文本 |
| `$danger` | `#8e2f27` | 危险操作 |

### 间距

`$space-1: 4px` / `-2: 8px` / `-3: 12px` / `-4: 16px` / `-5: 20px` / `-6: 24px` / `-8: 32px`

### 圆角 / 阴影 / 动效

```scss
$radius-sm: 8px;  $radius-md: 12px;  $radius-lg: 16px;  $radius-pill: 999px;
$shadow-card: 0 1px 2px rgba(20, 30, 25, 0.06);
$shadow-pop:  0 6px 24px rgba(20, 30, 25, 0.12);
$ease: 200ms ease;
```

### 环境色（`env-*`，位置圆点）

| Token | 值 | 环境 |
| --- | --- | --- |
| `$env-chilled` | `#4a8fd4` | 冷藏 0–4℃ |
| `$env-frozen` | `#7fa8d9` | 冷冻 −18℃ |
| `$env-cool` | `#8c7fa6` | 常温阴凉 |
| `$env-dry` | `#c4a05a` | 常温干燥 |
| `$env-ventilated` | `#6fa98c` | 常温通风 |
| `$env-dark` | `#5e6b78` | 常温避光 |

> UI 里**不要直接用这些 SCSS 变量**，而是走 `@/domain/types` 的 `ENV_MAP[env].color` / `.dotClass` —— 保证「环境 → 颜色」只有一份定义。

---

## Mixin

### `safe-top` / `safe-bottom`

```scss
@include safe-top;     // padding-top: env(safe-area-inset-top, 0px)
@include safe-bottom;  // padding-bottom: env(safe-area-inset-bottom, 0px)
```

### `tap-target($min: 44px)`

**视觉尺寸保持设计值，但把触控热区撑到 44px**（WCAG 2.1 AA 的 Target Size 要求）。

```scss
.icon-btn {
  width: 20px; height: 20px;   // 视觉是小图标
  @include tap-target;          // 热区撑到 44px
}
```

用 `::before` 伪元素实现，不影响布局盒模型。**所有小于 44px 的可点击元素都应该加上它。**

---

## 组件类速查

| 类 | 用途 |
| --- | --- |
| `.screen` / `.body` / `.body.has-tabbar` | 页面骨架：全屏列布局 / 内容区（留出 tabbar 高度） |
| `.navbar` | 子页顶栏（见 `components/README.md` 的安全区说明） |
| `.card` / `.thumb` / `.main` / `.row1` / `.sub` / `.bar` | 商品卡片 |
| `.badge` + `.b-fresh\|soon\|urgent\|over` | 新鲜度徽章 |
| `.loc-tag` / `.pos-dot` + `.cold\|frozen\|cool\|dry\|air\|dark` | 位置标签：**中性灰底 + 彩色圆点** |
| `.pos-scroll` / `.pos-chip` + `.on` / `.manage` | 位置横滑筛选栏 |
| `.btn` + `.btn-primary\|ghost\|danger` | 按钮三档 |
| `.field` / `.input` / `.stepper` / `.segment` / `.wrap-seg` | 表单控件 |
| `.tile` + `.on` / `.grid9` | 九宫格瓷砖（快速入库选食材） |
| `.sheet` / `.scrim` / `.grabber` | 底部弹框 + 蒙层 + 顶部小横条 |
| `.switch` + `.on` | 开关 |
| `.checkbox` + `.on` | 勾选框 |
| `.list-item` + `.done` | 购物清单条目 |
| `.summary` / `.metric` + `.is-warn` | 统计概览数字块 |
| `.waste-bar` | 位置分布条 |
| `.set-row` / `.section-title` / `.group-head` | 设置项 / 分组标题 |
| `.panel` / `.note` + `.is-warn` | 面板 / 提示条 |
| `.empty` | 空状态 |
| `.toast` | 全局轻提示 |
| `.tabbar` | 底部 Tab 栏 |
| `.table.mini` | 紧凑表格（EditView 的位置对比表） |

---

## 布局骨架

```
.screen                    全屏高度、flex 列
├── .topbar                主 Tab：纯白无标题（高度 = safe-area + 12px）
│   └── .navbar            子页：标题 + 返回（高度 = 48px + safe-area）
├── .body / .body.has-tabbar   可滚动内容区（has-tabbar 留出底部空间）
└── .tabbar                底部 Tab（含 safe-bottom）
```

---

## 修改 styles 的检查清单

- [ ] 改 token 值 → **先确认原型已同步**（`_tokens.scss` 顶部注释）
- [ ] 新增 token → 加进 `_tokens.scss` 并更新本文档的清单
- [ ] 新增组件类 → 加进上面的速查表
- [ ] 组件 `<style scoped lang="scss">` 里**没有魔法色值**（一律 `@use` token 或用 `ENV_MAP`）
- [ ] 小于 44px 的可点击元素加了 `@include tap-target`
- [ ] 涉及「选中态」用的是 `$primary-600`
- [ ] 顶部 / 底部容器处理了 `env(safe-area-inset-*)`
- [ ] 同步更新了根 `AGENTS.md`
