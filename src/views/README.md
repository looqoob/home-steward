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
| `/settings` | `SettingsView.vue` | NavBar | 设置 |
| `/backup` | `BackupView.vue` | NavBar | 备份导出/导入 |

路由定义在 `src/router/index.ts`，**全部懒加载**（`() => import('@/views/Xxx.vue')`）。

### 两种外壳

| 外壳 | 用途 | 顶栏 |
| --- | --- | --- |
| `TabLayout.vue`（见 `../layouts/`） | 三个主 Tab | **纯白无标题**的 `.topbar`（底部 Tab 已表明当前页） |
| `NavBar.vue` | 子页 | 标题 + 返回按钮 |

---

## StockView.vue — 库存

### 结构

1. **三指标概览**：今日待吃 / 已过期 / 本月浪费金额（`todayOverview` + `monthStats`）
2. **搜索框**：支持本名 + 字典标准名 + **别名**匹配
3. **位置筛选**：`LocationChipBar`，点击「管理」跳 `/locations`
4. **卡片列表**：按剩余天数升序

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

> ⚠️ `today` 是**在 setup 里求值一次**的常量。App 长期挂在后台跨零点后不会自动重算 —— 这是已知限制，刷新页面即可。别把它改成 `computed` 而不改其他地方，会造成同页面两种「今天」。

---

## ListView.vue — 购物清单

### 结构

按 `reason` 分成四组，**顺序固定**（直接影响用户注意力优先级）：

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

> 建议的生成发生在 `App.vue` 启动流程里（`shopping.generate()`），**不是本页面 triggering**。所以进页面如果没有内容，是规则没命中，不是 bug。

---

## MeView.vue — 我的

顶部三个数字（本月入库 / 已消耗 / 扔掉金额），中部位置分布条（`locationDistribution`），底部四个入口：位置管理 / 保质期字典 / 提醒设置 / 数据备份。

> 「本月」按 `Date.now()` 的月份计算，依赖 `monthStats`。

---

## ItemEditView.vue — 商品新建 / 编辑

同一个组件服务 `/item/new` 与 `/item/:id` 两条路由，靠 `route.params.id === 'new'` 区分。

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
- 用掉了 / 扔掉了 → `items.consume(id, type)`
- 删除 → `items.remove(id)`（软删，不写日志）

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
| 删除 | `locations.remove(id, items.list)` | **有在库物品时按钮 `:disabled`**，提示文案由 `domain` 给出 |

图标从预设汉字列表 `ICONS` 里选。

---

## DictView.vue — 保质期字典

1. **自定义列表**：当前自定义条目，可「恢复默认」（`dict.reset`）
2. **添加/覆盖表单**：名称 + 环境 + 天数 + 原因 → `dict.upsert`
3. **内置字典浏览**：按品类分组，点击条目**预填表单**（`prefill`）

> ⚠️ **改完字典后如果不调 `items.recomputeAll()`，已有商品的到期日不会更新。** 目前的行为是：重量级场景需要在 save 后显式触发。改动这块时留意。

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
| 导入 · 覆盖 | `importBackup(data, 'replace')` —— **清空后整批写入**，UI 必须做强确认 |

**导入后必须 `reloadStores()`** 重新 load 五个 store，否则 UI 显示旧内存状态。

> ⚠️ 这是用户数据的**唯一救生索**（无云同步）。任何削弱它的改动都要三思：`replace` 模式必须有二次确认。

---

## layouts/TabLayout.vue — Tab 外壳

**本项目最需要谨慎修改的文件之一。**

### 职责

- 底部三 Tab（库存 / 清单 / 我的）
- 顶部**纯白无标题** `.topbar`（只负责安全区高度）
- 右下角 FAB「快速入库」，**只在库存 Tab 显示**
- 承载 `QuickAddSheet`

### ★ 返回键治理

```ts
const isStock = computed(() => route.path.startsWith('/stock'));
const quickAddOpen = computed(() => route.query.quickadd === '1');
function openQuickAdd() { router.push({ path: '/stock', query: { quickadd: '1' } }); }
function closeQuickAdd() { if (route.query.quickadd) router.back(); }
```

```vue
<button v-if="isStock" class="fab" @click="openQuickAdd" aria-label="快速入库">＋</button>
<QuickAddSheet :model-value="quickAddOpen" @update:model-value="closeQuickAdd" />
```

完整原理见 `../components/README.md#-返回键治理务必理解后再改`。**任何全屏/半屏弹框都要照抄这个模式。**

### 三条视觉底线

1. `.topbar` 背景必须是 `#FFFFFF`（不能用品牌绿），且**不显示标题**。
2. `theme-color`（`index.html`）与 manifest `theme_color` 必须同为 `#FFFFFF`，否则状态栏会出现一条绿边。
3. `.topbar` 高度 = `env(safe-area-inset-top) + 12px`，让白色延伸到状态栏。

---

## 新增页面的检查清单

- [ ] 在 `src/router/index.ts` 注册（懒加载）
- [ ] 子页用 `<NavBar :title show-back @back="router.back()" />`；主 Tab 加到 TabLayout 下
- [ ] 业务计算在 `domain/`，数据操作走 store
- [ ] **组件默认导入**（`import X from '@/components/X.vue'`）
- [ ] 无模板可用于屏幕阅读的交互元素都加了 `aria-label`
- [ ] 同步更新了本 README 的路由映射表
- [ ] 同步更新了根 `AGENTS.md`
