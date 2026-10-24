# composables — 跨模块可复用逻辑

> 放「不属于任何单一 store、需要跨页面复用」的逻辑。
> 小而专：每个文件导出一个工厂函数，返回若干方法。

## useToast.ts — 全局轻提示

```ts
import { useToast } from '@/composables/useToast';

const { message, show } = useToast();
show('已加入：牛奶');          // 默认 2200ms 后自动清空
show('操作成功', 4000);        // 自定义时长

// 带「撤销」动作按钮：停留时长自动提升到至少 5s
const logId = await items.consume(id, 'consumed');
show(`已记录用掉：${name}`, 2200, { text: '撤销', run: () => items.undoConsume(logId) });
```

| 成员 | 类型 | 说明 |
| --- | --- | --- |
| `message` | `Ref<string>` | 当前提示文本，空串表示不显示 |
| `action` | `Ref<ToastAction \| null>` | 当前动作按钮（`{ text, run }`），无则为 `null` |
| `show(text, ms?, action?)` | `(text: string, ms?: number, act?: ToastAction) => void` | 显示提示。`ms` 默认 `2200` |
| `runAction()` | `() => void` | 执行当前动作并关闭 toast（App.vue 的按钮用） |
| `close()` | `() => void` | 立即关闭 |

### 边界条件

- **带 `action` 时停留时长自动取 `max(ms, 5000)`** —— 2.2s 来不及让人点「撤销」，这是刻意的兜底。

- `message` 是**模块级单例 ref**（不在工厂函数内部创建），所以**任何地方调用 `useToast()` 拿到的都是同一份状态** —— 这是刻意设计，跨页面共享一个 toast。不要把它改成每个组件独立的状态。
- 连续调用 `show` 会 `clearTimeout` 上一个定时器并重设，不会出现「后一条被前一条的定时器提前清掉」。
- `<div v-if="message" class="toast">` 的渲染挂在 `App.vue` 根部，所以**调用方不需要在自己模板里写 toast 节点**。

---

## useTheme.ts — 外观主题（深浅 + 主题色）

```ts
import { useTheme } from '@/composables/useTheme';

const theme = useTheme();
theme.sync(settings.settings.themeMode, settings.settings.accent); // App.vue 里 watch 调用
theme.resolved.value;   // 'light' | 'dark' —— 给 van-config-provider :theme 用
theme.adjusted.value;   // 用户选的色是否被自动微调过
theme.preview('#ff0000'); // 取色器拖动中预览：只改 DOM，不落库
theme.refresh();          // 放弃预览、回到已保存值（组件卸载时调用）
```

| 成员 | 类型 | 说明 |
| --- | --- | --- |
| `mode` | `Readonly<Ref<ThemeMode>>` | 存储中的模式（可能是 `system`） |
| `accent` | `Readonly<Ref<string>>` | 当前主色（已归一化） |
| `resolved` | `Readonly<Ref<'light' \| 'dark'>>` | 解析后的实际模式 |
| `adjusted` | `Readonly<Ref<boolean>>` | 主色是否被对比度校正过 |
| `sync(mode, accent)` | `(ThemeMode, string) => void` | 设置 → DOM 的同步入口，值没变就不重算 |
| `preview(hex)` | `(string) => void` | 临时预览（不落库、不写镜像） |
| `refresh()` | `() => void` | 丢弃预览、恢复已保存值 |

### 三条机制（改前必读）

1. **`html[data-theme]` 而不是 `@media`**：深色变量挂在 `html[data-theme='dark']` 上（见 `styles/README.md`）。媒体查询无法被应用内状态覆盖 —— 用户手选浅色但系统是深色时会失效，所以 `system` 在 JS 里解析成实际值后写进 `data-theme`。
2. **主题色整条色阶由 JS 写入 `<html>` 的 inline style**（`--primary-50…700`、`--focus-ring`、`--accent`）。inline 优先级高于 `:root`，CSS 里的色板只是首帧兜底。算法在 `domain/accent.ts`（纯函数，含 WCAG 对比度校正）。
3. **首屏防闪烁**：`index.html` 的内联脚本在首帧前读 localStorage 镜像 `hs.theme` 并写好 `data-theme`。Dexie 异步读不到，所以设置额外镜像一份；**镜像只是首屏优化，真源永远是 IndexedDB**，读不到就用默认值、绝不阻塞。

### 边界条件

- `preview()` 不写镜像也不落库，所以**调用方必须在卸载时 `refresh()`**，否则预览色会残留到下一次真正落库。
- 取色器 `input` 事件只预览、`change` 才落库 —— 反过来会在一次拖动里产生几十条 IndexedDB 写请求。
- `resolved` 是给 Vant 的：`<van-config-provider :theme>` 只认 `'light' | 'dark'`，传 `system` 会失效。
- 备份导入会整表替换 `settings`，`BackupView` 导入后重新 `load()` 了所有 store，所以主题会跟着变；**新增导入路径时要记得 reload settings**，否则主题不生效。

---

## useReminder.ts — 本地临期提醒

```ts
import { useReminder } from '@/composables/useReminder';

const reminder = useReminder();
await reminder.refresh();      // 启动时调用：按平台选择提醒策略并排通知
reminder.due();                // 同步拿到当前紧急/过期的商品列表
reminder.isNative;             // 是否运行在原生壳（APK）
```

### 返回值

| 成员 | 签名 | 说明 |
| --- | --- | --- |
| `due` | `() => Array<{ item: Item; f: Freshness }>` | **同步**。当前在库商品中新鲜度为 `urgent` 或 `over` 的列表（含标签文案） |
| `refresh` | `() => Promise<void>` | 按平台选择策略：原生壳调 `scheduleNative()`，否则 `notifyWeb()` |
| `isNative` | `boolean` | `Capacitor.isNativePlatform()` 的结果，在工厂调用时求值 |

### 两种平台策略

| 平台 | 实现 | 可靠性 |
| --- | --- | --- |
| **原生壳（APK）** | `@capacitor/local-notifications`，时间为下一个 `remindHour:remindMinute`（`nextDailyAt`）。**单件到期发独立通知**（保留 F3 点击直达）；**多件聚合成一条**「今日有 N 件需要关注」（v1.1 F10，防 N 连击轰炸逼用户关权限） | 真定时，App 不在前台也能弹 |
| **PWA** | Web `Notification` API，在**打开 App 时**立即弹一条汇总通知（最多列 3 条；单件时标题用物品名，与原生侧一致） | 不是真定时；浏览器没有可靠的后台定时器 |

### 边界条件（重要）

- **两条路径都用 `try {} catch {}` 吞掉所有异常**：权限被拒、插件不可用、非安全上下文，一律**静默降级**为 App 内的提醒条。提醒失败绝不能让应用崩。
- 通知 id 用 `hashId(item.id)`：同一个商品每次排通知拿到同一 id，便于覆盖。**存在哈希碰撞可能**（见 `domain/ids.ts`），对本场景可接受。多件聚合通知的 id 是 `hashId('hs-daily-summary')`（固定命名空间），点击后反查不到物品 → 自动落到库存页（与 F3 的兜底路径一致）。
- `scheduleNative` 会**先取消全部 pending 再重排**，避免重复堆积。
- **`schedule` 不设 `exact`**：Android 12+ 的精确闹钟需要 `SCHEDULE_EXACT_ALARM` 特殊权限，普通 App 不应申请。本产品对通知精度要求只是「明早告诉你该吃啥」，差几分钟无所谓。
- `due()` 依赖 `items.active` 已加载；在空/未加载状态下返回空数组，不抛错。
- PWA 路径会检查 `'Notification' in window`，不支持时直接返回。
- 权限弹窗策略：`Notification.permission === 'default'` 时才请求，**`'denied'` 时不再骚扰用户**。

### 通知点击直达（v1.1 F3，原生壳）

排程时通知 id = `hashId(item.id)`；点击导航的监听在 `App.vue`（`LocalNotifications 事件 localNotificationActionPerformed`，
冷启动事件先于 stores 加载，App 用 pendingNavId 挂起到 boot 完成）。改通知 id 生成方式时
**两处必须同步**（useReminder 排程 + App 反查）。PWA 侧需 injectManifest 自定义 SW，暂未做。

### ⚠️ 改这个文件的注意事项

1. 任何分支都不要 `throw` —— 用户禁用通知是常态，不是异常。
2. 新增平台分支时记得同步 `AGENTS.md` §5 的「两套壳的差异」表格。
3. 「排多条通知」在部分国产 ROM 上会被合并到「通知栏折叠区」，这是系统行为，应用层无法绕过。

---

## useSafeArea.ts — 顶部安全区（状态栏 / 刘海）的唯一真源

```ts
// main.ts —— 必须在 app.mount 之前调用一次
import { initSafeArea } from './composables/useSafeArea';
initSafeArea();

// 组件里（一般不需要读值，直接用 CSS 变量 --safe-top 即可）
const { safeTop } = useSafeArea(); // Ref<number>，单位 px
```

```html
<!-- 顶栏：只看 --safe-top，不写 env(safe-area-inset-top) -->
<header class="pt-[var(--safe-top)] h-[calc(48px+var(--safe-top))]">…</header>
```

| 成员 | 类型 | 说明 |
| --- | --- | --- |
| `initSafeArea()` | `() => void` | 挂到 `main.ts`，`app.mount` **之前**调用；幂等，重复调用无副作用 |
| `useSafeArea()` | `() => { safeTop: Ref<number> }` | 读当前安全区高度（模块级单例，所有组件共享同一个 ref） |
| `--safe-top` | CSS 变量（`<html>` inline） | **真源**。由 `initSafeArea` 写入，组件只认它 |

兜底高度 `FALLBACK_TOP`：`ios: 47`、`android: 24`、`web: 0`。原生壳里取 `max(env 实测值, 兜底值)`；
Web（浏览器 / PWA）只用 `env` 实测值 —— 桌面浏览器没有状态栏，兜底成 24px 反而是错的。

### 为什么需要它（★ 改之前必读）

`env(safe-area-inset-top)` 在 **Android WebView 里恒为 0**：它只反映刘海 / 挖孔，不反映状态栏。
而 Capacitor 8 + targetSdk 36 的 WebView 是 edge-to-edge 绘制，页面从屏幕最顶端开始，状态栏浮在上面 ——
于是所有「顶栏 + 返回按钮」都会压到状态栏里，返回按钮点不到。JS 也没有 API 能读 `status_bar_height`
（`window.innerHeight` 不含状态栏）。

所以这里用「探针 div 读 `env` 真实值 → 平台兜底值补足」的办法拿到一个**够用**的高度，
一次性写进 `<html>` 的 inline `--safe-top`。新增二级页时只要走 `NavBar` / `PageShell` / `meta.header`
任一方式，就自动带安全区，**不需要页面作者记得补 padding**。

### 边界条件

- `initSafeArea()` 必须在 `app.mount` 之前调用，否则首帧顶栏会先贴到屏幕最顶端再跳下来。
- 探针 div 会临时插进 `<body>` 并立刻 `remove()`；它 `position: fixed` + `pointer-events: none` + 不可见，不影响布局。
- `resize` / `orientationchange` 用 `requestAnimationFrame` 合并，横竖屏切换会重新解析。
- 只处理**顶部**。底部 `env(safe-area-inset-bottom)` 仍由各处直接写（本项目暂未遇到恒 0 的问题）。

---

## useNow.ts — 响应式的「当前时刻 / 今天」（跨零点刷新）

`useNow()` 返回模块级单例的 `ref(Date.now())`：60s 一跳 + `visibilitychange`（切回前台立即取新值）。
`useToday()` 是它的封装，返回 `computed(() => todayStr(now.value))`。

### 为什么必须有它（REV-28）

PWA 会被挂在后台一整天。`const today = todayStr()` 在 setup 里只取一次，之后「剩余天数 /
今日待办 / 统计」整天停在昨天，只有手动刷新才恢复。所有**按天计算**的组件
（StockView / TodayTodo / ItemCard / ItemGroupCard / StocktakePanel / GroupConsumeSheet /
StatsView / QuickAddSheet 的预览）一律走 `useToday()`，别再定格 `todayStr()`。

### 边界条件

- 单例 + 懒启动：首次调用才挂定时器与监听；node 测试环境守了 `typeof document`。
- 事件驱动的函数（如 ScanSheet 的 watch、ConsumeLogView 的 `relDay`）每次调用现取
  `todayStr()` 即可，不需要接这个 composable。

---

## 新增 composable 的约定

- 文件名 `useXxx.ts`，导出同名工厂函数 `useXxx()`。
- 需要跨页面共享的状态放**模块级**（像 `useToast` 的 `message`）；需要每个组件独立的放**工厂内部**。这两种语义要在 JSDoc 里写清楚。
- 不要 `import` 任何 `.vue` 组件 —— composable 只处理逻辑。
- 同步更新本 README 与根 `AGENTS.md`。
