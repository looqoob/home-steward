# composables — 跨模块可复用逻辑

> 放「不属于任何单一 store、需要跨页面复用」的逻辑。
> 小而专：每个文件导出一个工厂函数，返回若干方法。

## useToast.ts — 全局轻提示

```ts
import { useToast } from '@/composables/useToast';

const { message, show } = useToast();
show('已加入：牛奶');          // 默认 2200ms 后自动清空
show('操作成功', 4000);        // 自定义时长
```

| 成员 | 类型 | 说明 |
| --- | --- | --- |
| `message` | `Ref<string>` | 当前提示文本，空串表示不显示 |
| `show(text, ms?)` | `(text: string, ms?: number) => void` | 显示提示。`ms` 默认 `2200` |

### 边界条件

- `message` 是**模块级单例 ref**（不在工厂函数内部创建），所以**任何地方调用 `useToast()` 拿到的都是同一份状态** —— 这是刻意设计，跨页面共享一个 toast。不要把它改成每个组件独立的状态。
- 连续调用 `show` 会 `clearTimeout` 上一个定时器并重设，不会出现「后一条被前一条的定时器提前清掉」。
- `<div v-if="message" class="toast">` 的渲染挂在 `App.vue` 根部，所以**调用方不需要在自己模板里写 toast 节点**。

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
| **原生壳（APK）** | `@capacitor/local-notifications` 为**每件**临期物品排一条通知，时间为下一个 `remindHour:remindMinute`（`nextDailyAt`） | 真定时，App 不在前台也能弹 |
| **PWA** | Web `Notification` API，在**打开 App 时**立即弹一条汇总通知（最多列 3 条） | 不是真定时；浏览器没有可靠的后台定时器 |

### 边界条件（重要）

- **两条路径都用 `try {} catch {}` 吞掉所有异常**：权限被拒、插件不可用、非安全上下文，一律**静默降级**为 App 内的提醒条。提醒失败绝不能让应用崩。
- 通知 id 用 `hashId(item.id)`：同一个商品每次排通知拿到同一 id，便于覆盖。**存在哈希碰撞可能**（见 `domain/ids.ts`），对本场景可接受。
- `scheduleNative` 会**先取消全部 pending 再重排**，避免重复堆积。
- **`schedule` 不设 `exact`**：Android 12+ 的精确闹钟需要 `SCHEDULE_EXACT_ALARM` 特殊权限，普通 App 不应申请。本产品对通知精度要求只是「明早告诉你该吃啥」，差几分钟无所谓。
- `due()` 依赖 `items.active` 已加载；在空/未加载状态下返回空数组，不抛错。
- PWA 路径会检查 `'Notification' in window`，不支持时直接返回。
- 权限弹窗策略：`Notification.permission === 'default'` 时才请求，**`'denied'` 时不再骚扰用户**。

### ⚠️ 改这个文件的注意事项

1. 任何分支都不要 `throw` —— 用户禁用通知是常态，不是异常。
2. 新增平台分支时记得同步 `AGENTS.md` §5 的「两套壳的差异」表格。
3. 「排多条通知」在部分国产 ROM 上会被合并到「通知栏折叠区」，这是系统行为，应用层无法绕过。

---

## 新增 composable 的约定

- 文件名 `useXxx.ts`，导出同名工厂函数 `useXxx()`。
- 需要跨页面共享的状态放**模块级**（像 `useToast` 的 `message`）；需要每个组件独立的放**工厂内部**。这两种语义要在 JSDoc 里写清楚。
- 不要 `import` 任何 `.vue` 组件 —— composable 只处理逻辑。
- 同步更新本 README 与根 `AGENTS.md`。
