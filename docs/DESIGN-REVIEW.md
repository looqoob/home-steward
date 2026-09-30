# 家庭物资管家 · UI/UX 设计评审与优化方案

> 评审对象：`src/` 全量视图 + `styles/` 设计系统（v0.1）
> 评审基线：WCAG 2.2 AA、移动优先 320–480px、8px 基线栅格
> 结论：设计系统**骨架健康**，主要短板集中在三处 —— **无障碍合规**、**库存页信息层级**、**高频操作路径深度**。
> 本文件只做评审与方案，不含已落地代码；改动需同步更新 `AGENTS.md` 与 `src/styles/README.md`。

> ⚠️ **状态说明（2026-09 迁移后）**：本文档写于样式从「手写 SCSS」迁移到「Tailwind + Vant」**之前**。文中对 `_tokens.scss` / `base.scss` / `@mixin tap-target` 的引用已失效（这三个文件已删除，token 现集中在 `src/styles/index.css`）。但评审的**结论与可访问性基线仍然有效**，且对应的修复已在迁移中落地：`index.css` 的 `@layer base` 加了全局 `:focus-visible` 焦点环、`bg-page`/`bg-card` 等变量化支持深色模式、`--text-3` 等对比度基线已校准；44px 触控热区改为用 Tailwind `min-h-11`/`min-w-11`。新代码请以前述文件为准。

---

## 1. 应当保留的现有资产（勿重构）

| 资产 | 位置 | 为什么有价值 |
| --- | --- | --- |
| Token 单一真源 | `src/styles/_tokens.scss` + `base.scss` 的 `:root` 双轨 | 改一处全站生效，是所有优化的最低改动面入口 |
| 新鲜度四态语义色 | `$state-*-bg / fg / bar` | 语义闭环（背景/前景/进度条），状态可扩展 |
| 环境与位置解耦 | `domain/types.ts` 的 `ENV_MAP` | 提供 `label / fullLabel / color / dotClass`，避免 UI 硬编码「冷藏」 |
| 44px 热区 mixin | `@mixin tap-target(44px)` | 具备 WCAG 2.5.8 意识，只需扩大覆盖面 |
| 弹层路由驱动 | `TabLayout.vue` 的 `?quickadd=1` | 返回键关弹层，符合移动端直觉，优于局部状态 |

---

## 2. 问题清单

严重度：**P0** 合规阻塞 / 高影响 · **P1** 体验效率 · **P2** 锦上添花

### 2.1 无障碍合规（P0）

| # | 位置 | 问题 | 依据 |
| --- | --- | --- | --- |
| A1 | `_tokens.scss` `$text-3: #8b938e` | 白底对比度 **3.16:1**，远低于 4.5:1。影响 `.metric .lab`、`.card .sub`、`.why`、`.empty`、`.set-row .val`、`.pos-chip .n` —— 几乎全部辅助文字 | WCAG 1.4.3 |
| A2 | `index.html` `maximum-scale=1` | 禁止缩放，用户无法放大文本 | WCAG 1.4.4（要求 200%） |
| A3 | `ENV_LIST` 三个环境色 | 非文本图形对比需 ≥3:1：冷冻 `#7FA8D9` **2.46**、干燥 `#C4A05A` **2.46**、通风 `#6FA98C` **2.72** 均不达标 | WCAG 1.4.11 |
| A4 | `.tile.on .ic` | 白字压在 `$primary-500 #2e9e6b` 上 = **3.38:1** | WCAG 1.4.3 |
| A5 | 多处可点击 `div` | `ItemCard`（div@click）、`.checkbox`（role=checkbox）、`.switch`（role=switch）、`.set-row`（div@click）均无 `tabindex` 与键盘处理；`BackupView` 用 `<label class="btn">` 包裹 `display:none` 的 file input，键盘无法触发 | WCAG 2.1.1 |
| A6 | `base.scss` | 仅 `.btn:focus-visible` 有焦点环，其余可聚焦元素无可见焦点 | WCAG 2.4.7 |
| A7 | 危险操作 | 删除物资、删除位置、清除已购、**覆盖导入（先清空本机）** 均一键生效，无确认、无撤销 | 通用可用性 |

### 2.2 信息层级与视觉（P1/P2）

| # | 位置 | 问题 |
| --- | --- | --- |
| B1 | `TabLayout.vue` `.topbar` | 顶部只剩 12px + 安全区白条，不承载标题也不承载操作，首屏黄金区浪费 |
| B2 | `StockView.vue` `.summary` | 三宫格全白底 + 纯数字，无语义色、不可点击、缺「在库总数」；「本月浪费」与前两项时间维度不一致 |
| B3 | `StockView.vue` 列表 | 已按剩余天数排序但**无视觉分组**，用户要逐张读 badge 才知道今天该吃什么 |
| B4 | `ItemEditView.vue` | 「用掉了/扔掉了」这个最高频收尾动作需 4 步：库存 → 详情 → 用掉 → 返回 |
| B5 | `StockView.vue` | 搜索框与位置胶囊不吸顶，滚动后失去筛选上下文 |
| B6 | `TabLayout.vue` + `.body` | `.body` 底部仅 12px，FAB 高 52 + 12 间距 = 64px，末张卡片被压住 |
| B7 | `QuickAddSheet.vue` | 九宫格固定 9 项、不可搜索、不可连续录入；单位输入框与数量分离；主按钮在滚动区末尾；无「最近入库」复用 |
| B8 | 各页 `.empty` | 空态只有文案没有 CTA 按钮 |
| B9 | `ItemCard.vue` `.thumb` | 缩略图用名称首字，品类识别度为零，扫视成本高 |
| B10 | `ItemEditView.vue` | 四列中文对比表在手机上拥挤；「生产日期/手填保质期/单价/备注」平铺无分区 |
| B11 | `MeView.vue` | 位置分布无图例、标签 60px 截断、只有数量没有百分比语义 |
| B12 | `stepper` | 数量只能 ±1，无法输入 `0.5 / 1.5 斤` 这类常用值 |
| C1 | 全局 | 无深色模式（`prefers-color-scheme`），夜间/暗光场景缺失 |
| C2 | 全局 | 无 `prefers-reduced-motion` 降级；弹层无进场动效；列表无增删过渡 |
| C3 | 全局 | 11px 中文过小（`.metric .lab`、`.badge`、`.why`、`.pos-chip .n`），建议 ≥12px |
| C4 | `.toast` | `position: fixed` 在桌面 480px 居中预览时贴视口底而非容器内 |
| C5 | 表单 | 校验仅靠 Toast，无内联错误态与必填标识 |
| C6 | 首启动 | 无引导/示例数据，空库用户不知从何开始 |

---

## 3. 优化方案

### 3.1 Token 层一次性修复（A1 / A3 / A4 / C3）

替换 `_tokens.scss` 中的取值（`base.scss` 的 `:root` 会自动跟随，无需二次改动）：

```scss
// 中性：text-3 由 #8b938e 提到 #6b736e（4.88:1，满足 AA 正文）
$text-3: #6b736e;

// 环境色：三个未达 3:1 的色值加深（其余三个已达标，保持不变）
$env-frozen:     #5b87be; // 原 #7fa8d9 2.46 → 3.71
$env-dry:        #a9823c; // 原 #c4a05a 2.46 → 3.53
$env-ventilated: #4f8a6e; // 原 #6fa98c 2.72 → 4.04
// 已达标的保留：$env-chilled #4a8fd4 3.40 / $env-cool #8c7fa6 3.68 / $env-dark #5e6b78 5.45

// 选中态图标底改用 600 而非 500（白字 4.90:1）
// .tile.on .ic { background: t.$primary-600; }
```

⚠️ `ENV_LIST`（`domain/types.ts`）里的 `color` 字段是硬编码的十六进制，**与 SCSS token 是两份数据**，改 token 时必须同步改这里，否则圆点色与图例色漂移。建议顺手把 `ENV_LIST.color` 改为 `'var(--env-chilled)'` 形式，彻底消灭双份维护。

字号刻度（恢复 8px 基线，取消 11px）：

```
12  辅助文字 / 徽标 / 计数
13  正文次级 / 表单标签
14  正文 / 按钮
15  卡片标题
17  页面标题（navbar）
20  指标数字
24  大标题（首屏问候）
```

### 3.2 无障碍基线补丁（A5 / A6 / C2）

**① 全局焦点环 + 动效降级** —— 追加到 `base.scss`：

```scss
:where(button, a, input, select, textarea, [tabindex],
       [role='button'], [role='checkbox'], [role='switch']):focus-visible {
  outline: 2px solid var(--primary-700);
  outline-offset: 2px;
  border-radius: var(--radius-sm);
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

**② 语义化替换清单**（把 `div + @click` 换成原生控件，是最省事的修法）：

| 现在 | 改为 | 说明 |
| --- | --- | --- |
| `ItemCard` 根 `div @click` | `<article>` + 内部名称区用 `<button class="card-hit">` | 卡片内还要放「用掉/扔掉」两个按钮，不能整卡是 button（嵌套非法） |
| `.checkbox` `div[role=checkbox]` | `<button role="checkbox" :aria-checked>` | 原生 button 自带 Tab 焦点与 Space/Enter 激活 |
| `.switch` `div[role=switch]` | `<button role="switch" :aria-checked>` | 同上，零 JS 成本 |
| `.set-row` `div @click` | `<button class="set-row">` | 需补 `text-align: left; width: 100%` |
| `<label class="btn">` + 隐藏 file | `<button @click="pick">` + `ref` 上的隐藏 input（用 `visibility:hidden` 而非 `display:none`，保证可聚焦） | 或直接给 label 加 `tabindex="0"` + `keydown.enter` |

**③ 触控目标统一**：`.pos-chip`（32px）、`.segment button`（34px）、`.wrap-seg button`（34px）统一提到 **40px 高 + 6px 行间距**；空间紧张处至少 36px，并用 `tap-target(44px)` 补足热区。

### 3.3 库存页改版（B1 / B2 / B3 / B5 / B6 / B8 / B9）

目标：**打开就知道今天该吃啥**，而不是打开看到一张长列表。

新的信息层级（自上而下）：

1. **标题行**：「库存」+ 日期 + 在库总数（替代现在的空白 `.topbar`）
2. **待办区（语义色卡片，可点击筛选）**
   - 今日待吃 → `urgent` 语义色底
   - 已过期 → `over` 语义色底
   - 在库 N 件 / 本月浪费 → 中性底
   - 每项都做成可点击，点了直接把列表筛到该状态
3. **搜索框**
4. **位置胶囊**（sticky，`top: 0` + 页面底色 + 底部 1px 分隔线）
5. **分组列表**（sticky 分组头）
   - 🔴 紧急待吃（≤ urgentDays）
   - 🟠 临期（≤ soonDays）
   - 🟢 新鲜
   - ⚪ 未设保质期 / 不建议存放
6. **空态**：插图 + 文案 + 主按钮「添加第一件物资」

关键代码（sticky 筛选条 + 分组头）：

```scss
.filter-sticky {
  position: sticky;
  top: 0;
  z-index: 10;
  background: var(--bg-page);
  padding: 8px 0;
  border-bottom: 1px solid var(--line);
}
.group-head {
  position: sticky;
  top: 52px; /* = 筛选条高度 */
  z-index: 9;
  background: var(--bg-page);
}
.body { padding-bottom: 84px; } /* 让出 FAB 空间，修 B6 */
```

分组数据（纯函数，放 `domain/freshness.ts`）：

```ts
export type FreshGroup = 'urgent' | 'soon' | 'fresh' | 'none';
export const GROUP_LABEL: Record<FreshGroup, string> = {
  urgent: '紧急待吃', soon: '临期', fresh: '新鲜', none: '未设保质期',
};
/** 把已排序的列表切成带分组头的段落，空组自动跳过 */
export function groupByFreshness<T extends { state: FreshnessState }>(
  list: T[],
): Array<{ group: FreshGroup; label: string; items: T[] }> { /* ... */ }
```

### 3.4 卡片快捷操作（B4）

卡片右侧加一组 32px 图标按钮（热区 44px），把最高频动作提到列表层：

```
┌────────────────────────────────────┐
│ [🥛] 牛奶  剩 2 天        [✓] [🗑] │
│      2 盒 · 冷藏 · ▓▓▓░░           │
└────────────────────────────────────┘
        ✓ = 用掉了   🗑 = 扔掉了
```

- 两个按钮都直接调 `items.consume(id, 'consumed' | 'wasted')`，一步完成。
- 操作后卡片用 `<TransitionGroup>` 做 200ms 淡出 + 位移（仅动 `opacity`/`transform`）。
- Toast 带 **撤销**：`已记录用掉 · 撤销`，5 秒内可回滚（见 3.6）。

### 3.5 快速入库弹框改版（B7 / B12）

| 区域 | 改动 |
| --- | --- |
| 顶部 | 「最近入库」横向 chips（取 `logs` + `items` 最近 8 个去重），一键复用 |
| 搜索 | 输入框支持任意名称，回车即创建（不再强制走九宫格） |
| 九宫格 | 保持 9 宫格但可横向滚动分页，超出部分不裁剪 |
| 数量 | stepper 中间数字可点击直接输入（支持 0.5），下方单位 chips：`个 / 袋 / 斤 / 瓶 / 盒` |
| 位置 | chips 保持，右侧「＋新位置」 |
| 预览 | 保留现有 `note` 到期日预测（这是本弹框最有价值的信息） |
| 底部 | **sticky 双按钮**：「加入并继续」+「加入」——连续录入不必反复开关弹框 |

sticky 底栏：

```scss
.sheet-foot {
  position: sticky;
  bottom: 0;
  background: #fff;
  padding: 12px 0 calc(4px + env(safe-area-inset-bottom));
  display: flex;
  gap: 8px;
  border-top: 1px solid var(--line);
}
```

### 3.6 危险操作确认与撤销（A7）

新增一个轻量确认组件 `ConfirmSheet.vue`（底部弹层，标题 + 说明 + 取消/确认），覆盖三处：

- 删除物资 → 「删除后不可恢复，确定删除「牛奶」？」
- 删除位置 → 现有 `disabled` 只挡了「有在库物品」的情况，仍应二次确认
- 覆盖导入 → **必须确认**，文案写明「将清空本机现有数据」

同时给 `useToast` 加撤销能力：

```ts
show(message, { actionText: '撤销', onAction: () => items.restore(id) })
```

> 注：目前 `remove()` 走 `db.items.softDelete`，本身是可恢复的，撤销实现成本低；`consume()` 改的是 `status` 字段，回滚只需还原 `in_stock` 并删日志。

### 3.7 详情与统计微调（B10 / B11）

- **ItemEditView**：把「生产日期 / 手填保质期 / 单价 / 备注」折叠进「更多选项（可选）」，默认只露出名称、数量、位置、到期日预览；四列对比表改为两列卡片式（位置名 + 天数，到期日作为副行）。
- **MeView**：位置分布条加图例（环境色点 + 名称），标签宽度 60 → 88px，右侧显示 `12 件 · 34%`。

### 3.8 深色模式（C1，可选）

`_tokens.scss` 只有一套浅色值，加深色最省事的做法是在 `base.scss` 里覆盖 CSS 变量（不动 SCSS 变量，避免全站重编）：

```scss
@media (prefers-color-scheme: dark) {
  :root {
    --bg-page: #141816;
    --bg-card: #1c211f;
    --bg-sunken: #232926;
    --line: #2e3532;
    --text-1: #e8ece9;
    --text-2: #a8b0ac;
    --text-3: #7f8783;
    --primary-600: #35a874;   /* 深色底上需提亮主色 */
  }
}
```

⚠️ 落地前需逐项复算对比度（尤其 `--text-3` 与四态语义色），深色不是简单反色。
⚠️ `index.html` 的 `theme-color` 需同步加 `<meta name="theme-color" content="#1c211f" media="(prefers-color-scheme: dark)">`。

---

## 4. 落地顺序

| 批次 | 内容 | 范围 | 风险 |
| --- | --- | --- | --- |
| **批次一 · 合规基线** | 3.1 Token 修正 + 3.2 无障碍补丁 + A2 移除 `maximum-scale` | 纯样式 + 标签替换，无逻辑改动 | 极低，可一次 PR 完成 |
| **批次二 · 库存页** | 3.3 库存页改版 + 3.4 卡片快捷操作 + 3.5 弹框改版 | 视图与新增 domain 纯函数 | 中，需回归排序/筛选 |
| **批次三 · 体验完善** | 3.6 确认与撤销 + 3.7 详情统计微调 + 3.8 深色模式 | 新增组件 + token 扩展 | 中低，可拆开发 |

建议按批次串行，每批结束跑一次 `npm run typecheck` + 真机 320px 宽度验证。

---

## 5. 验收清单

- [ ] 全站最小字号 ≥12px，无 11px 中文
- [ ] 所有正文/辅助文字对白底 ≥4.5:1（重点复查 `--text-3`）
- [ ] 所有环境色圆点对白底 ≥3:1
- [ ] 移除 `maximum-scale=1`，页面可双指放大到 200%
- [ ] 仅用键盘可完成：入库 → 筛选 → 标记用掉 → 导出备份
- [ ] 每个可聚焦元素都有可见焦点环
- [ ] 所有可点击控件触控热区 ≥44×44（视觉可小，热区不能小）
- [ ] 删除 / 覆盖导入有二次确认；删除后有撤销入口
- [ ] 库存页滚动后筛选条与分组头吸顶
- [ ] 末张卡片不被 FAB 遮挡（底部留白 ≥84px）
- [ ] 空态提供可点击 CTA
- [ ] `prefers-reduced-motion` 下动效关闭
- [ ] 320px 宽度下无横向滚动、无文字截断
- [ ] 改动已同步 `AGENTS.md` 与 `src/styles/README.md`

---

## 6. 实施进度

三个批次均已落地（2026-09-29），`npm run typecheck` 与 `npm run build` 全部通过。

| 批次 | 内容 | 状态 |
| --- | --- | --- |
| 一 · 合规基线 | Token 对比度修正（`$text-3`、3 个环境色、`.tile.on .ic`）、移除 `maximum-scale`、全局焦点环、`prefers-reduced-motion`、5 处控件语义化、触控目标 40px、取消 11px 字号 | ✅ |
| 二 · 库存页重构 | `groupByFreshness` 分组纯函数、页面标题行、语义色可筛选概览卡、双层吸顶（筛选条 + 分组头）、卡片快捷消耗、FAB 让位 84px、空态 CTA | ✅ |
| 三 · 体验完善 | `ConfirmSheet` 二次确认（删除物资 / 删除位置 / 覆盖导入）、Toast 撤销（消耗 + 删除）、快速入库连续录入与吸底主操作、详情「更多选项」折叠、深色模式 | ✅ |

### 落地时与本文档的差异（记录下来，避免后人困惑）

- **概览卡第三格改成「在库」而非「本月浪费」**：库存页聚焦「今天要处理什么」，浪费金额在「我的」页已有，不重复。
- **`over`（已过期）在分组里并入 `urgent` 组**，但「已过期」卡单独筛 `state === 'over'`，所以 `statusFilter` 的类型是 `FreshGroup | 'overdue' | null` 而非纯 `FreshGroup`。
- **`.act` 按钮视觉 36px、`gap: 10px`**：两个按钮的 44px 热区间距太小会重叠，容易误触「扔掉」。改间距前先想清楚。
- **深色模式只覆盖 CSS 变量**，不动 SCSS 变量；因此组件里所有 `#fff` 背景都改成了 `var(--bg-card)`，新增样式必须遵守。
- **`--primary-600` 深浅都是 `#228055`**：白字 4.9:1，提亮就掉出 AA；焦点环改用单独的 `--focus-ring` 变量解决深底不可见的问题。
- **`remove()` 必须返回删除前快照**：`db.items.all()` 过滤 `deletedAt`，删完查不回来，撤销只能靠快照。
