# 迭代评审报告 · v1.0.0 基线（2026-10-23）

> 目的：找出 v1.0.0 发布后仍然存在的**缺陷**与**可优化点**，按「会不会丢数据 / 会不会让用户做错事 / 值不值得现在做」排序，作为下一轮迭代的输入。
>
> 方法：4 路只读并行审计（领域层+单测、data/stores、views/components/composables、构建/PWA/Capacitor/文档），
> 每条结论都回到源码逐行复核；无法在沙箱内复现的（构建、真机）单独标注。
>
> 已排除：`docs/DESIGN-REVIEW.md` 三批（A1–A7 / B1–B12 / C1–C6）已修的无障碍与视觉层级问题、
> `docs/PITFALLS.md` 已知坑位已覆盖的行为（2026-10-24 前记在 `AGENTS.md §10`，批次 D1 迁出）。本文只写**尚未修**的。

---

## 0. 一句话结论

核心体验（入库 → 折叠 → 消耗 → 统计）已经闭环，v1.0.0 剩下的问题集中在**三个批量入口的并发/合并语义**
（盘点、扫码、清单全部入库）、**导入链路的写前校验**、以及**打包与仓库卫生**。
前两类会直接产生错误库存或错误统计，建议优先于任何新功能。

> 编号按发现批次追加：REV-01~41 为第一批（4 路并行审计），REV-42 起为第二批（领域层 + 单测复核）。
> 阅读时以所在小节（P0 / P1 / P2）判断优先级，不必按编号顺序读。

---

## 1. 验证基线（本机可复现的结论）

| 项 | 结果 | 说明 |
| --- | --- | --- |
| `npm run typecheck` | 通过 | 无错误 |
| `npm test`（`npx vitest run --pool=threads --configLoader native`） | 174 用例 / 11 文件全过 | 默认 forks 池在本机沙箱报 `spawn EPERM`，属环境限制 |
| `npm run build` | **未验证** | 沙箱内 rolldown/vite 打包配置时 `spawn EPERM`、`@tailwindcss/oxide` 的 `.node` 加载失败、`src/components.d.ts` 写入被拒。请在本机普通终端跑一次 `npm run build` 确认 |
| 单测覆盖 | 174 例，但**零覆盖** `shelfLife.computeExpiry` / `createItem` / `planShopping` / `normalizeName` / `resolveAccent` | 核心到期日算法没有断言，是 REV-14 能长期存活的原因 |

更细的缺口（都是导出函数、零直接用例）：`dates`（`toDateStr` / `diffDays` / `monthKey` / `fromEpoch` / `nextDailyAt`）、`ids`、`categories.guessCategory`、`itemFactory.createItem`（含 `dictKey` 的写入）、`shelfLife.compareLocations`、`locationRules`、`shoppingRules.planShopping`、`normalize.normalizeName`、`accent` 全模块、`stats.monthStats` / `locationDistribution`。REV-42/44/46/47 都活在这个盲区里。

---

## 2. P0 · 必修（会产生错误数据，路径常见）

> ✅ 本批已修：REV-01、REV-02、REV-03、REV-42（落地明细见 §10）。

| 编号 | 位置 | 问题 | 建议 |
| --- | --- | --- | --- |
| REV-01 | `src/components/StocktakePanel.vue:55-63`、`src/views/StockView.vue:568` | **盘点队列被 watcher 重置**。`queue` 初值是进入时的快照（:36），但只要 `props.rows` 变化就整体重排并 `cursor=0`；`judge()` 里 `items.consumeGroup()` 会 `load()` → `rows` 变新数组 → watcher 在 `judge` 的 await 续体之前触发。表现：盘点一物后列表+游标归零，**第二件被跳过**、进度从 1/20 变 1/18，收尾统计与撤销都错 | `watch` 加 `if (openedAt !== props.sessionId) return` 之类的守卫，或把 watcher 限制为「仅首次挂载时」快照；`queue` 只在 `defineProps` 默认值里算一次 |
| REV-02 | `src/components/ScanSheet.vue:147-149`、`:112-131`、`:163-183` | **扫码每帧回调重复入库**。html5-qrcode 的解码回调按帧触发，`(d) => { void onScan(d) }` 没有任何 busy/去重；`doInbound` 先 `await items.addMany(...)`，最后才 `await stopScanner()`（:181）。连扫同一码 3 帧 → 入库 3 次，数量叠加 | `let busy = false` 守卫 + 入参去重（同一 code 500ms 内只处理一次）+ **先停扫再写库** |
| REV-03 | `src/stores/items.ts:86-105`（`:93-103`）、`src/stores/shopping.ts:196-229`（`:201-205`）、`src/views/ListView.vue:104-118` | **清单「全部入库」合并同名项后，撤销导致库存双计**。`addMany` 跨 input 合并（同位置 + 到期日 ≤1 天），`landed` 里两行指向同一对象；`inboundAll` 把同一个 `created[i].id` 写进每一行；撤销只按「1 行 = 1 物品」回滚。场景：清单两行「牛奶」（自动临期 + 手动）→ 入库 1 件 qty=2 → 撤销第 1 行 → 第 1 行再入库新建 qty=1 → **库存 3 盒（实际 2 盒）** | 二选一：① `inboundAll` 检测 1:N 时把合并量拆回各行并清空 `inboundItemId`；② 清单入库**不做跨 input 合并**（入库一条记录 = 一个批次，与 `AGENTS.md §5.6` 一致）。撤销入库改为按 `snapshot.item.id` 精确对账 |
| REV-04 | `android/app/build.gradle:8-15` | **release 签名口令明文入库**（`storePassword 'home1234'` / `keyPassword 'home1234'`），且 `storeFile file('../../release.keystore')` 指向的密钥**不在仓库也不在磁盘**（`.gitignore:76` 忽略，`ls` 确认不存在）→ 干净 checkout 上 `assembleRelease` 直接失败，密钥口令已随 git 历史外泄 | 换钥换口令；口令移入不入库的 `keystore.properties`，`build.gradle` 用 `Properties` 读取，缺文件时给出明确报错而不是静默用默认值 |
| REV-42 | `src/domain/categories.ts:30-39`（`KEYWORDS` 顺序）→ `src/data/dict/index.ts:81-84` | **品类关键词顺序把常见食物判错，默认保质期错好几倍**：`meat` 排在 `eggMilk` 之前，且 `meat` 关键词里有 `鸡`/`鸭`/`牛` → `guessCategory('土鸡蛋')`、`('有机牛奶')`、`('自制酸奶')` 全都落到 `meat` → 冷藏 **3 天**（`eggMilk` 是 14 天）；`fruit` 里的 `瓜` 排在 `vegetable` 之前 → `'贝贝南瓜'`、`'黄瓜条'` 落到 `fruit` 7 天（`vegetable` 5 天）。字典没收录的名字一律走 `f?.category ?? guessCategory(name)` 这条路，用户会被提示「鸡蛋 3 天后过期」 | 调整顺序：`eggMilk`、`frozenFood` 提到 `meat` 之前，`vegetable` 提到 `fruit` 之前；或改成「取最长命中的关键词」。补一张 `guessCategory` 表驱动用例 —— 这是唯一能钉住顺序的测试 |

---

## 3. P1 · 数据与持久化（会丢/脏/看不见，但触发条件有限）

> ✅ 批次 2 已修：REV-05、REV-07、REV-08、REV-09、REV-23（落地明细见 §11）。
> ✅ 批次 4 已修：REV-10、REV-13（未分配桶 + 入库过滤；「删除位置迁移记录」未做，见 §13）、REV-14、REV-15（检测 + 自动重读；深度并发写保护经需求方 2026-10-24 定案不做）、REV-43（落地明细见 §13）。

| 编号 | 位置 | 问题 | 建议 |
| --- | --- | --- | --- |
| REV-05 | `src/data/backup/import.ts:55` → `src/data/dict/index.ts:60` → `src/domain/normalize.ts:12` → `src/stores/dict.ts:13` | **dict 表完全不清洗**：合并导入只要有一条 `dictKey: 123`（或缺失），`normalizeName` 的 `.trim()` 抛 `TypeError`，`buildCustomMap` 在 `map` computed 里抛 → 商品编辑 / 快速入库 / 扫码 / 清单入库卡**四个入口永久白屏**，重启无效（数据已落库） | dict 纳入 `sanitize`（`dictKey` 必须字符串、`env` 白名单、`days` 数值校验，非法整条丢弃并计数）；`buildCustomMap` 对非字符串 key 跳过而不是抛错 |
| REV-06 | `android/app/src/main/AndroidManifest.xml:38-41` | **APK 缺 `CAMERA` 权限**（只有 `INTERNET`）。Capacitor `BridgeWebChromeClient.onPermissionRequest` 对 VIDEO_CAPTURE 做运行时申请，未声明则直接 `deny` → `getUserMedia` reject。APK 里扫码**永久**降级为手输。`README.md:58-72` 写了手动加权限的步骤但从未执行；同处 :63 称「android/ 目录不入库」也与事实相反（`git ls-files android` = 53 个文件） | manifest 增加 `<uses-permission android:name="android.permission.CAMERA" />`，并补 `android:required="false"` 的 `<uses-feature android:name="android.hardware.camera" />`；修正 README |
| REV-07 | `src/data/backup/import.ts:64-73`（`:66` 无条件 `db.wipe()`） | **覆盖导入先清库、后写入**。`validateBackup` 只校验信封；`sanitizeItems` 会把缺 id / 空 name 的整条丢弃。若备份里 items 全被清洗，6 张表被清空后写入 0 条并返回 `ok:true`「已覆盖导入（物品 0 位置 0 日志 0）」——本机唯一副本归零 | wipe 前加守卫：`incomingItems.length === 0 && data.items?.length > 0` 时中止并报「备份内容无法解析，未做任何修改」；覆盖导入前自动导出一份快照 |
| REV-08 | `src/data/backup/sanitize.ts:107-121` / `:165-179` / `:204-211` / `:239-245` | 四处 sanitize 都是 `{ ...o, ... }` 展开后只覆写白名单字段，**`deletedAt` 原样穿透**（:64 注释称会丢，代码没做）。备份里 `"deletedAt": "0"` / `"false"` / `{}` 进库后 `sources.ts:11` 的 `!r.deletedAt` 判假 → 记录**永久隐身**，而导入结果仍报 `dropped:0 fixed:0` | 四个 sanitize 显式归一 `deletedAt`：仅保留 `> 0` 的有限数字，其余置 `null` 并计入 `fixed` |
| REV-09 | `src/data/backup/import.ts:72`、`src/stores/settings.ts:23-49` | 导入的 settings **不经过 `normalizeSettings`**：`settings.id` 不是 `'singleton'` 时写进孤立行，`get('singleton')` 仍返回旧值（整份设置静默不生效 + 垃圾行）；`"remindEnabled":"false"` 是真值 → 提醒照旧；`lastBackupAt` 非数字 → 「上次备份」显示 NaN | 导入也走 `normalizeSettings` 并强制 `id: 'singleton'`；`remindEnabled` 用 `=== true` 归一 |
| REV-10 | `src/stores/dict.ts:28`（注释要求调用）→ `src/stores/items.ts:290`（定义） | **`recomputeAll()` 全仓无调用点**。改自定义保质期（`DictView.vue:49,55` 只 upsert/reset）后，已有物品的 `expireAt` 永不重算 → 用户按错误日期吃/扔；`reset()` 也回不来（`src/views/README.md:439` 自认是已知缺口） | `DictView` 保存/恢复后 `await items.recomputeAll()`；`dict.upsert/reset` 内直接调用更稳妥（可加 `recomputeAll` 的事务版本，避免 N 次全量写） |
| REV-11 | `src/views/SettingsView.vue:55-57`、`:39-44`、`src/composables/useReminder.ts:33-55`、`src/App.vue:63` | `reminder.refresh()` **只在启动时调一次**。切换「临期提醒」开关、修改提醒时间都不重新排程；**关闭提醒也不会 `cancel` 已排程的通知** → 原生壳里关掉后第二天照旧弹，改时间不重启不生效 | `settings.patch` 后触发 `reminder.refresh()`（或在 store 里 `watch` 相关字段）；`scheduleNative` 在 `remindEnabled === false` 时先 cancel 再 return |
| REV-12 | `src/components/QuickAddSheet.vue:135-154` / `:319-326`、`src/views/ItemEditView.vue:97-141` / `:330` | 保存类按钮**没有 in-flight 守卫**，`items.add()` 也不去重（只有 `addMany` 合并）。手机卡顿一下双击 → 两条同位置同数量记录；编辑页双击时第一条已 `router.back()`，第二条照样写入 | 统一 `saving` ref：置位后禁用按钮，`finally` 复位；`items.add` 内部可对「同 id」幂等（编辑路径本来就有 id） |
| REV-13 | `src/domain/inbound.ts:89`、`src/domain/stats.ts:92-102`、`src/stores/locations.ts`（删除逻辑） | 删除位置后**历史与在库记录变成孤儿**：`inboundDefaults` 的 `prev?.locationId ?? firstEnabled(...)` 不校验存在/启用 → 一键入库把物品写进**不存在的位置**，此后只在「全部」可见；`locationDistribution` 的 `total = live.length`，孤儿不计入任何位置 → 百分比合计 < 100%，且没有「未分配」桶 | `inboundDefaults` 过滤 `enabled && !deletedAt` 的位置；`locationDistribution` 增加「未分配」桶（或先把孤儿归到首个启用位置）；删除位置时把在库/历史记录迁到「未指定」并提示 |
| REV-14 | `src/domain/itemFactory.ts:41`（`dictKey: name`）→ `src/domain/grouping.ts:52` | **`dictKey` 恒等于用户输入的原始名字**，而 `foldKeyOf` 是 `item.dictKey ?? aliasKey?.(name) ?? normalizeName(name)` → 第一级永远命中，**别名与归一化两级永远不会执行**。`StockView.vue:140` 明确注释「传 `foodKeyOf` 让番茄与西红柿折叠成一张卡」，实际「番茄」+「西红柿」仍是两张卡；全角/大小写/多余空格同样不折叠 | `createItem` 的 `dictKey` 改为 `normalizeName(name)`，并从 store 侧传入 `aliasKey`（`foodKeyOf`）取别名词根；补一条用例钉住「番茄 + 西红柿 = 1 组」 |
| REV-15 | `src/stores/items.ts:116,131,147,162,170,211`、`src/stores/settings.ts:77-79`、`src/stores/shopping.ts:69`、`src/data/dexie/db.ts:32` | 写操作是**整条 `put` 基于内存旧快照**，且 Dexie 没有任何 `blocked` / `versionchange` / 跨标签广播。两个标签页同时开着时，A 消耗后 B 改备注 → B 用旧快照整条覆盖，A 的消耗消失（代码路径可证，未做双标签实测） | 写操作改 `table.update(id, patch)` 或在事务内 `get()` 合并；监听 `db.on('versionchange')` 提示刷新。至少要能检测到多标签并提示「另一个窗口有更新」 |
| REV-16 | `src/stores/items.ts:189-218`、`src/views/StockView.vue:254-257`、`src/components/TodayTodo.vue:62-68` | 单条消耗的 `status` 校验基于**内存快照**、早于读库；卡片的 ✓ 与待办按钮都 `void consume(...)` 无 busy 锁 → qty=1 时双击写两条日志、物品只 finished 一次，统计翻倍，撤销只能删后一条 | `consume` 在事务内重读 item 再判 `in_stock`；调用点加 busy 锁（或 store 内按 itemId 做 Promise 互斥） |

| REV-43 | `src/stores/shopping.ts:41`、`src/domain/shoppingRules.ts:103-107`、`:20` | **「删除自动建议」的 7 天抑制完全失效**。`generate()` 传的是 `list.value`（来自 `db.shopping.all()`，`src/data/dexie/sources.ts:9-12` 已过滤软删），而 `planShopping` 的 `dismissed` 集合**只从 `deletedAt` 非空的行构造** → 恒为空集，`DISMISS_DAYS`（:20）声明后从未被读。表现：忽略「牛奶 / 库存 0」→ 下次启动（`App.vue:62` 每次启动都 `generate()`）立刻又出现；`stores/shopping.ts:34-36` 的 JSDoc 与 `stores/README.md` 都承诺 7 天内不重生 | 给 `ShoppingRepository` 加一个「含软删」的读取方法（如 `allIncludingDeleted()`）传给 `planShopping`，或把忽略记录单独持久化（`dismissed: name|reason → until`）；顺手让 `DISMISS_DAYS` 真正参与计算 |

---

## 4. P1 · 交互与体验（用户当场感知）

> ✅ 本批已修：REV-12、REV-16（落地明细见 §10）。
> ✅ 批次 4 已修：REV-11（提醒重排程 + 关闭取消）、REV-17~22（落地明细见 §13）。

| 编号 | 位置 | 问题 | 建议 |
| --- | --- | --- | --- |
| REV-17 | `src/styles/index.css:347-357`（`.field-input{font-size:14px}`）、`src/components/SearchField.vue:44`（`text-[14px]`） | iOS Safari 对 **< 16px** 的输入框聚焦时整页放大且失焦不还原（顶栏/底部 Tab 被推出屏幕），PWA 用户每输入一次就要双指缩回 | 输入类字号提到 16px（或用 `max(16px, 1em)`），视觉尺寸靠 padding 收 |
| REV-18 | `src/views/StockView.vue:92`、`:97-100`、`:574-601` | 概览卡三处口径不一致：「在库」用 `items.active.length`（全量），「已过期」用 `rows.filter(...)`（受搜索/位置筛选），旁边又写「今日待吃 `todo.length`」（不受筛选）。`rows` 也不排除 snooze，而 :97-98 注释声称「被明天再说延后的不计入」→ 切位置后「在库 20 / 列表 5」，搜索时会看到「已过期 0」但列表里有红条 | 抽 `useInventoryStats(rows, todo)`（或 domain 函数）统一三个数字的来源与是否受筛选影响；注释与实际行为对齐 |
| REV-19 | `src/views/ListView.vue:312-316`、`src/stores/shopping.ts:127-133` | 「清空已购」**无二次确认、无撤销**（单条移除有撤销）。逐条 `await put` 中途配额失败 → 一半消失一半还在 | 走 `ConfirmSheet`（破坏性操作已有组件），`bulkPut` 一次写完并保留快照给 toast 撤销 |
| REV-20 | `src/components/QuickAddSheet.vue:74-77` | `watch(customName, v => { if (v.trim()) selected.value = v.trim() })` 清空时不重置 `selected`，`canAdd` 仍为 true → 输入「鸭血」再全删，仍按「鸭血」入库 | `else` 分支把 `selected` 复位到上一个正式选择 |
| REV-21 | `src/components/ItemGroupCard.vue:123` | `expanded = ref(props.group.members.length <= 2)` 不响应 group 变化（`:key` 是稳定的 `group.key`）→ 3 份消耗 1 份后仍收起、2 份变 3 份后仍展开 | 用 `watch(() => props.group.members.length)` 或 `computed` 派生默认展开 |
| REV-22 | `src/views/ListView.vue:176` | 页头「需买 `shopping.visible.length` 件」把已勾选/已入库也算进去，与「还有 N 件没买」的直觉不符 | 改用 `shopping.pending.length` |
| REV-23 | `src/views/StockView.vue:625-639` | 空态文案是「没有符合条件的物资」，但 `#action` 固定「添加第一件物资」并打开快速入库 → 搜索无结果时按钮文不对题 | 空态按「库存真空」/「筛选无结果」分两套文案与动作（后者给「清除筛选」） |

---

## 5. P1 · 交付与工程卫生

> ✅ 批次 3 已修：REV-24、REV-25、REV-26（TS 版本需在本机 `npm install` 后才与 `package.json` 对齐）；REV-27 已在批次 2 修（落地明细见 §12）。

| 编号 | 位置 | 问题 | 建议 |
| --- | --- | --- | --- |
| REV-24 | `android/app/src/main/AndroidManifest.xml:5` | `android:allowBackup="true"` 且没有 `fullBackupContent` / `dataExtractionRules`：应用数据（WebView 存储）会被 Auto Backup / D2D 纳入，与「数据 100% 本机、无云同步」的产品底线冲突。是否包含 IndexedDB 取决于系统默认规则，但代码里**没有任何显式排除** | `allowBackup="false"`（最简单、最符合产品承诺）；若确实想备份，再写排除规则 |
| REV-25 | `package.json:18` | `"apk": "cd android && ./gradlew assembleDebug"` 在 Windows cmd 下 `cd android && ./gradlew` 不可执行（`cd` 是 cmd 内建，`&& ./x` 不是可执行文件）→ `npm run apk` 必失败 | 用 `cd android && gradlew.bat assembleDebug`，或 Node 脚本按平台挑 `gradlew` / `gradlew.bat` |
| REV-26 | git 索引、`package.json:38`、`src/main.ts:11` | 仓库卫生三处：① `package-lock.json` 已从索引删除（`git ls-files` 为空、`.gitignore` 并未忽略它）→ 干净 clone 无锁、`npm ci` 失败、版本漂移；② `"typescript": "^5.6.3"` 与 AGENTS.md「锁定 5.6.3」矛盾，实测装的是 **5.9.3**（坑位 #1 的雷随时会踩）；③ `src/main.ts` 引入的 `src/composables/useSafeArea.ts` **尚未入库**（`??`）→ 提交树直接构建失败 | 恢复 `package-lock.json`；改成 `"typescript": "5.6.3"`；提交 `useSafeArea.ts` 及其文档改动 |
| REV-27 | `src/data/seed.ts:16-17` | `ensureSeed` 只判断「活跃位置数是否为 0」，于是：导入一份位置全丢的备份、或用户把位置全删了，下一次启动 6 个预设位置**又回来**（且内置位置删不掉） | 用「是否初始化过」标记（settings 里一个 `seededAt`）判断，而不是当前行数 |

---

## 6. P2 · 值得顺手做（不阻塞发布）

| 编号 | 位置 | 问题 / 机会 |
| --- | --- | --- |
| REV-28 | `src/views/StockView.vue:45`、`ItemCard.vue:29`、`ItemGroupCard.vue:95`、`TodayTodo.vue:32`、`StocktakePanel.vue:27`、`GroupConsumeSheet.vue:32`、`StatsView.vue` | `todayStr()` 在 setup 取一次常量 → PWA 常驻后台跨零点后，剩余天数/待办/统计**整天停在昨天**，刷新才变。建议 `composables/useNow(60s)` + `visibilitychange` 重新取 |
| REV-29 | `src/views/StockView.vue:124`、`src/domain/shoppingRules.ts:75-79` | 搜索与「库存为 0」判断都用原始字符串匹配，别名/归一化不参与（「西红柿」搜不到「番茄」，购物清单会重复推荐）→ 复用 `normalizeName` / `foodKeyOf` 做匹配键 |
| REV-30 | `src/domain/stats.ts`（`monthStats` / `wasteTrend` / `topWasted`） | 不校验 `ConsumeLog.at` 是否 `isDateStr`，脏值经 `fromEpoch(NaN)` 产生 `'NaN-NaN-NaN'` 后被静默丢弃 → 不崩，但统计静默少算。建议统一 `dateOf()` 守卫并计数 |
| REV-31 | `src/domain/shelfLife.ts:86` | `compareLocations` 返回 `envLabel: loc.env`（枚举值 `'chilled'`），而不是 `ENV_MAP[loc.env].label`。当前 `ItemEditView.vue:259` 自己用 `ENV_MAP[row.env].label` 渲染，所以没暴露 —— 但这是**错误的字段**，下一个调用者会直接当真 | 改成 `ENV_MAP[loc.env].label`（domain 已依赖 types，无分层问题） |
| REV-32 | `src/stores/items.ts:239-244` | `undoConsume` 注释主张按 `cur.quantity < log.quantity` 对账，代码只看 `status === 'in_stock'` → 「部分消耗 + 整条消耗」后撤销前者漏加数量。toast 单槽位让它难触达，属潜在缺陷 | 按注释实现对账 |
| REV-33 | `src/data/backup/import.ts:94-98`、`:118-127` | ① 事务提交后才重排位置并改 `updatedAt: now`：失败时数据已导入却返回 `ok:false`；本机位置永远「更新」使合并导入的位置改名/排序进不来；② `mergeById` 的 `cur` 来自已滤软删的 `all()` → **本地删除会被旧备份复活**；`ConsumeLog` 无 `updatedAt` 只能比 `createdAt` | 收尾放进同一事务，失败只告警；合并让 tombstone 参与比较 |
| REV-34 | `src/data/dexie/sources.ts:129-141` | `probe()` 只读，全链路**没有 `QuotaExceededError` 处理**；`SettingsView.vue:27,56` 等写入口无 catch → unhandled rejection、UI 静默不生效。建议写一条探针再删，并在写入口统一 try/catch 提示「存储空间已满」 |
| REV-35 | `src/stores/items.ts:94`、`src/stores/locations.ts`（`countOf`） | 性能：`addMany` 每个 input 都 `[...byId.values()]` 重建数组（O(n²) 拷贝）；位置管理页每行调一次 `countOf`（O(位置×物品)）。清单一键入库 200 行时明显 | 建一次 Map 索引；位置计数一次扫物品聚合 |
| REV-36 | `src/domain/shoppingRules.ts:132` | `NO_LOCATION` 的哨兵值里含一个**真实 NUL 字节**（文件偏移 4857）→ git 把整个 `shoppingRules.ts` 当二进制，`git diff` 与内容搜索全部失效，这个文件的改动无法 review | 把该字节写成**转义序列**（源码里写作 `\u0000`）：运行时字符串完全不变、文件变纯文本；若要彻底避免控制字符，改成 `'__none__'` 并同步 `groupShoppingByLocation` 的映射 |
| REV-37 | `src/composables/useReminder.ts:60-78` | PWA 分支用 `new Notification(...)`：Chrome for Android 上该构造函数非法（必须走 `ServiceWorkerRegistration.showNotification`），iOS Safari 不支持 → 目标平台上这条路径实际不生效（异常被 catch 吃掉），只有 App 内待办条兜底 | 改走 `navigator.serviceWorker.ready.then(r => r.showNotification(...))`，或明确删掉这条路径、只保留 App 内提醒（避免「以为有通知」） |
| REV-38 | `vite.config.ts:82-86`、`:117-122`、`index.html:46-73` | ① 没有配 `base`（默认 `/`），而 AGENTS.md:43 称「base 相对路径」，`index.html` / manifest `start_url` / `workbox.navigateFallback` 全是根绝对 → 部署到子路径会白屏；② `host:'0.0.0.0'` + `allowedHosts:true`（LAN 预览可被任意 Host 访问，DNS rebinding）；③ 全仓无 CSP，注入脚本可直接读 IndexedDB 并调用剪贴板导出 | 要么配 `base: './'` 并改绝对路径，要么修正 AGENTS.md；`allowedHosts` 收窄；补一条保守的 CSP |
| REV-39 | `android/app/build.gradle:32`、`package.json`、`android/…/AndroidManifest.xml` 合并结果 | release 构建 `minifyEnabled false`、无 `shrinkResources`；`@capacitor/app` 装了但 `src/` 零 import；合并 manifest 从 `local-notifications` 继承了 `SCHEDULE_EXACT_ALARM` / `RECEIVE_BOOT_COMPLETED` / `WAKE_LOCK`，与坑位 #7「不设 exact 以避开精确定时」的说法不符（见 `docs/PITFALLS.md`）（有权限但没用） | 打开 minify + 规则；移除未用依赖，或说明用途；在 AGENTS 里写清继承来的权限为什么留着 |
| REV-40 | `tsconfig.json:16`、`vite.config.ts:120`、`:84-85` | `types` 只有 `vite/client` / `vite-plugin-pwa/client`，却 include `vite.config.ts`（用 `node:url`、`process.env`），`@types/node` 只靠传递提升；`vitest.config.ts` 从未参与 typecheck；`preview` 端口配置与 `package.json` 的 `--port 4173` 打架；`assetsInlineLimit` 注释理由不成立 | 显式加 `@types/node`；把 `vitest.config.ts` 纳入；统一端口 |
| REV-41 | 文档 | 漂移：`docs/ARCHITECTURE.md:197` 仍写「APK 尚未产出」；`src/domain/README.md:70` 仍写 `SCHEMA_VERSION = 1`；`AGENTS.md` 把 `@capacitor/app` 列入技术栈但未使用、§2 称 base 相对路径；`README.md:63` 称 android/ 不入库 | 顺手改掉，避免下一个 AI/人按错文档做事 |
| REV-44 | `src/domain/grouping.ts:108-115` | 组卡 `totalQuantity` 把**不同单位**的数量直接相加，`unit` 却取 lead → 同位置「牛奶 2 盒 + 1 袋」显示「共 3 盒」。建议按 `unit` 拆组，或展示分单位明细 |
| REV-45 | `src/domain/grouping.ts:197-201`、`src/domain/bulk.ts:126-137`、`src/domain/shoppingRules.ts:60-61`、`src/domain/stats.ts:62,188` | §5.7「三层防御」的残留缺口：`expiryCompatible` / `planBulkMove` 未过 `isDateStr`（脏 `expireAt: 0` → `parseDate(0)` 抛 TypeError；今天靠 sanitize 兜住，但契约已破）；消耗/浪费时间窗 `now - l.at <= 60*DAY` **无下界**，未来时间戳（时钟跳变）永远算「最近消耗」；`monthStats` / `wasteTrend` 未守 `l.at`。建议统一 `dateOf()` 守卫 + `l.at <= now` |
| REV-46 | `src/domain/stats.ts:124-136`、`:294-314`、`src/domain/__tests__/stats.test.ts:144-152` | 统计实现与自家文档相反：`todayOverview` 是**死代码**（全仓无引用）且规则与 `buildTodayTodo` 分叉（不看 `snoozeUntil`、吃裸 `urgentDays`），与坑位 #21 的教训直接冲突；`turnoverDays` 的 JSDoc 写「只统计已用完」，代码循环**全部** items，而用例用默认 `in_stock` 夹具把错误行为钉死。建议删 `todayOverview`（或改为调 `buildTodayTodo`）、`turnoverDays` 补 `status === 'finished' && !deletedAt` 过滤并改用例 |
| REV-47 | `src/domain/stats.ts:275`、`src/domain/shoppingRules.ts:75,77,92` | 聚合键用**原始名**：「番茄」与「番茄（西红柿）」在 Top 浪费里占两行、清单里各推一条、库存判断还认不出是同一物。建议按 `normalizeName(name)` 归并、展示首个原名 |
| REV-48 | `src/domain/dates.ts:22-24`、`src/data/backup/sanitize.ts:87-93` | `isDateStr` 只校验格式，`sanitize` 直接信任 → 手改备份 `"expireAt": "2026-13-01"` 进库变成 2027-01-01，卡片显示「到期日 13-01」（`formatMD`）；`"2026-02-31"` 变 03-03。建议 sanitize 额外要求 `toDateStr(parseDate(v)) === v`，运行时仍保留宽松守卫防崩 |
| REV-49 | `src/data/backup/sanitize.ts:60-64`、`:108-121` | 清洗余量不足：`quantity: 0 / -3 / "3"` 一律变 **1**（「明确清空」变成「1 件在库」，`fixed` 只 +1、不区分修了什么）；`name` 只用于判空、入库仍是带首尾空白的原值；`createdAt` 未校验；`:60-64` 注释写「丢 status / 丢 deletedAt」，而代码保留 status 且展开原样穿透 `deletedAt`（REV-08）。建议 0 保留为 0（或丢弃并计数）、`name: name.trim()`、`createdAt` 归一并计数、修正注释 |
| REV-50 | `src/domain/grouping.ts:78-80`、`:175-176`、`src/domain/locationRules.ts:10-12 / :17-18`、`src/domain/__tests__/freshness.test.ts:86-109 / :111-134` | 内部重复实现会漂移：`grouping` 自己复制了一份 `round2`（`price.ts:30` 已有）、手拼 today 字符串而非 `todayStr(now)`；`locationRules` 同一个「有效位置」谓词写两遍；`freshness.test.ts` 里有两个逐字节相同的 `describe` 块。建议统一引用并删重复块 |

---

## 7. 可优化的产品方向（不属于缺陷，按性价比排）

1. **跨零点自动刷新**（REV-28）：一个 `useNow` 就解决「凌晨还在看昨天」，对本地生活类 App 体感收益最大。
2. **申请持久存储**：批次 5 已做 `navigator.storage.persist()` 静默申请；「已保护/可能被清理」状态展示 UI 经需求方 2026-10-24 定案不做。
3. **导入前自动快照 + 一键回滚**：配合 REV-07，把「覆盖导入」从危险操作变成可后悔操作。
4. **消耗撤销升级为「最近操作」列表**（现在是 toast 单槽位，切页即丢）：`ConsumeLog` 已经是完整流水，做一个可撤销的历史面板成本不高。（✅ 已落地，批次 F1）
5. **搜索与清单匹配接别名**（REV-29）：直接复用 `foodKeyOf`，让 `dictKey` 修复（REV-14）的红利扩散到搜索与采购建议。
6. **库存列表虚拟滚动 / 分页**：当前全量渲染组卡，几百件时首屏与滚动会掉帧（`foldItems` + 排序每次 computed 全量重算）。（✅ 已定案要做 → 批次 F10）
7. **统计导出 CSV / 分享图**：纯本地前提下，导出文件是唯一能与家人共享的方式。（✅ CSV 已落地，批次 F2；分享图留二期）
8. **无障碍补全**：趋势图目前只有 `aria-label`，柱状图缺 `role="img"` + 数值文本；盘点面板缺 `aria-live` 播报。
9. **iOS/Android 真机走查**：盘点手势、折叠展开、320px 宽度三处仍是「只在桌面 Chromium 看过」的状态（V3 §15.2 自认）。

---

## 8. 建议的迭代批次

| 批次 | 内容 | 预估 | 理由 |
| --- | --- | --- | --- |
| **批次 1 · 止血** | REV-01 盘点队列、REV-02 扫码去重、REV-03 清单入库撤销、REV-12/REV-16 按钮 busy 锁、REV-42 品类关键词顺序（一行改动 + 一张表驱动用例） | 1 天 | 三个批量入口都是「一次操作产生多条错误数据」，用户无法自查；REV-42 让「鸡蛋 3 天过期」这类错日期消失 |
| **批次 2 · 数据安全** | REV-05 dict 清洗、REV-07 导入守卫 + 自动快照、REV-08 `deletedAt`、REV-09 settings 归一、REV-23 `ensureSeed` | 1–2 天 | 全部围绕「脏备份 → 白屏 / 数据消失」，且都能补单测 |
| **批次 3 · 交付** | REV-04 签名、REV-06 CAMERA、REV-24 allowBackup、REV-25 apk 脚本、REV-26 lock/TS/useSafeArea | 0.5 天 | 让「干净 clone → 能构建 → 能打 release APK → 扫码可用」这条链路真的成立 |
| **批次 4 · 一致性** | REV-10 recomputeAll、REV-11 提醒重新排程、REV-13 孤儿位置、REV-14 dictKey 折叠、REV-15 多标签、REV-17~22、REV-43 清单忽略失效 | 2 天 | 修「承诺了但没生效」的功能与当场可感知的体验问题 |
| **批次 5 · 优化** | REV-28 跨零点、持久存储、REV-29 别名搜索、REV-30~41 与 REV-44~50 的 P2 清理 | 2–3 天 | 不阻塞发布，但决定「用久了还顺不顺手」 |

每批完成后按 `AGENTS.md §12` 的双验走：`npm run typecheck && npm test && npm run build`，涉及 UI/路由的再 `npm run preview` 手点一遍（含安卓返回键）。

---

## 9. 复核记录（避免误报 / 避免重复报）

- **`isDateStr` 正则没问题**：工具输出把 `\d` 显示成 `\\d`，用 Node 读原文件确认 `src/domain/dates.ts:23` 是 `/^\d{4}-\d{2}-\d{2}$/`，174 个用例里 freshness/stats 全过也印证了这一点。
- **构建失败不是项目缺陷**：沙箱内 `vite.config` 打包 `spawn EPERM`、`@tailwindcss/oxide-win32-x64-msvc` 的 `.node` 读取失败、`components.d.ts` 写入被拒——都是本机沙箱限制，需要在普通终端复验。
- **`docs/DESIGN-REVIEW.md` 的 A/B/C 三批已修**（对比度、焦点环、`maximum-scale`、`ConfirmSheet`、长按误触、Toast 撤销、深色模式变量等），本文没有重复列入。
- **`docs/PITFALLS.md` 坑位**已覆盖的行为（如 `foldItems → sortByFreshness → groupBy*` 的顺序、`sticky` 内容盒偏移、`dictKey` 定格的**意图**）不重复报；REV-14 报的是「实现与意图不符」。
- **账目对不上但属设计选择**：`stockValue` 把过期物资也计入「在库总额」并单列 `overAmount`；`topWasted` 只统计有单价的记录并在 UI 提示——这两条注释完整，判定为有意为之，不算缺陷。
- **第二批（领域层 + 单测）** 的 3 个 P1 已并入：REV-42（品类顺序，实读 `categories.ts:30-39` 确认）、REV-43（7 天抑制失效，另核 `shoppingRules.ts:103-107` 与 `sources.ts:9-12`）、REV-14（`dictKey` 成因）；其余 P2 并入 REV-44~50。该批报告里「`dates.ts` 正则坏了」一条**未采纳**——是工具输出转义造成的假阳性（见上一段）。

---

## 10. 批次 1 落地记录（2026-10-23）

**已修**（编号同 §2 / §4）：

| 编号 | 改动 | 位置 |
| --- | --- | --- |
| REV-01 | 删掉 `watch(() => props.rows, …)` 重置块（改为一段解释注释），新增 `judging` 挡同一张卡连点 | `src/components/StocktakePanel.vue` |
| REV-02 | `DEDUPE_MS = 1500` + `busy` 忙锁 + 同码时间窗；**先 `stopScanner()` 再 `addMany`**；未知码先停扫；`saveNewMapping` / `saveMappingOnly` 加锁；表单按钮 `:disabled` | `src/components/ScanSheet.vue` |
| REV-03 | 「全部入库」改调 `items.addMany(inputs, { merge: false })`：一条清单行 = 一条批次记录 | `src/stores/shopping.ts`、`src/stores/items.ts` |
| REV-12 / REV-16 | `saving` 防连点（保存 / 加入按钮 disabled）；`consumeInFlight` 挡同一物品并发消耗 | `src/components/QuickAddSheet.vue`、`src/views/ItemEditView.vue`、`src/stores/items.ts` |
| REV-42 | `KEYWORDS` 重排（`eggMilk → frozenFood → vegetable → seafood → meat → soy → seasoning → fruit → grainOil → dryGoods`），`meat` 去掉裸「牛/羊」；新增 27 条表驱动用例 | `src/domain/categories.ts`、`src/domain/__tests__/categories.test.ts` |

**验证**：`vue-tsc --noEmit` 0 错误；vitest **12 文件 / 201 用例全通过**（新增 27 例）。`npm run build` 仍受本机沙箱限制未验证（见 §9），需在普通终端补跑一次。

**文档同步**：`AGENTS.md` §10 新增坑位 #54 / #55 / #56、§5.6 补 `{ merge: false }` 注记；`src/domain/README.md`（KEYWORDS 顺序的四条理由）、`src/components/README.md`（盘点「队列必须是快照」+ ScanSheet 去重约定）、`src/stores/README.md`（`addMany` 新签名、`consumeInFlight`、`inboundAll` 边界条件）、`src/views/README.md`（ItemEditView 防连点）。

**有意未做**：盘点仍要求「筛选变化退出重进」而不是就地重排队列（就地重排需要先定「盘到一半改筛选」的语义）；扫码 1.5s 去重窗口是经验值，真机走查后可调。

---

## 11. 批次 2 落地记录（2026-10-23）

**已修**（编号同 §3）：

| 编号 | 改动 | 位置 |
| --- | --- | --- |
| REV-05 | 新增 `sanitizeDict`：缺 id / `dictKey` 空 / `days` 不是「正整数或 `-1`」→ 丢并计数；`env` 非法回落 `cool`；`dictKey` 过 `normalizeName` 并去重 | `src/data/backup/sanitize.ts`、`import.ts` |
| REV-07 | 防空覆盖守卫（`items` 原条数 > 0 且清洗后 0 → 中止并说明「本机数据未改动」）+ 覆盖前存 JSON 快照 + 成功 toast 带「撤销覆盖」 | `src/data/backup/import.ts`、`src/views/BackupView.vue` |
| REV-08 | 所有实体补清洗 `createdAt` / `updatedAt` / `deletedAt`（`deletedAt` 非有限数 → `null`），脏时间戳计 `fixed` | `src/data/backup/sanitize.ts` |
| REV-09 | 新增 `domain/settings.ts` 的 `normalizeSettings`（唯一来源），store 与导入共用：`id` 恒 `singleton`、布尔用 `typeof`、时间戳非有限正数 → `null`、枚举白名单、数值 clamp | `src/domain/settings.ts`、`src/stores/settings.ts`、`src/data/backup/import.ts` |
| REV-23 | 「是否首次启动」改判 `Repository.countAll()`（含软删除行），位置全删光后重启不再重播预设 | `src/data/repository.ts`、`src/data/dexie/sources.ts`、`src/data/seed.ts` |

**验证**：`vue-tsc --noEmit` 0 错误；vitest **14 文件 / 226 用例全通过**（新增 `domain/__tests__/settings.test.ts` 8 例、`data/__tests__/seed.test.ts` 3 例、`sanitize.test.ts` 扩到 45 例）。`npm run build` 仍受沙箱限制，需在普通终端补跑。

**文档同步**：`AGENTS.md`（§3 目录树加 `domain/settings.ts`、§5.5 补 `countAll` 段、§10 坑位 #57~#60、§11 加「设置归一」行）；`src/data/README.md`（`countAll` 契约、`seed.ts` 判据、`sanitizeDict`、导入守卫与快照）；`src/domain/README.md`（新增 `settings.ts` 小节）；`src/stores/README.md`（settings 归一已搬到 domain）；`src/views/README.md`（BackupView 撤销覆盖）。

**有意未做 / 已知代价**：

- 快照只存在 `BackupView` 的内存里，**离开页面即失效**。够用（覆盖是当场发生的），但不要把它当成备份功能。
- `sanitizeDict` 对「天数非法」是**丢**而不是猜：字典是用户手填的，猜一个天数比缺一条更糟（缺的还有内置字典与品类默认兜底）。
- 守卫只看 `items`：`locations` 全被清洗为空时仍会覆盖。理由是位置可以重建、物品不行；如果将来位置里挂了更多东西，这条要重新评估。
- REV-13（孤儿 `locationId`）与 REV-10（`recomputeAll` 无人调用）仍开放，属于批次 4。

---

## 12. 批次 3 落地记录（2026-10-23）

**已修**（编号同 §5）：

| 编号 | 改动 | 位置 |
| --- | --- | --- |
| REV-04 | 明文签名口令全删：签名只从 `android/keystore.properties`（git 忽略，模板 `keystore.properties.example`）或 `HOME_STEWARD_KEYSTORE` / `_STORE_PASSWORD` / `_KEY_ALIAS` / `_KEY_PASSWORD` 四个环境变量读；`gradle.taskGraph.whenReady` 在 release 任务缺签名时**抛错中止**，绝不产出未签名包 | `android/app/build.gradle`、`android/keystore.properties.example`（新）、`.gitignore` |
| REV-06 | `AndroidManifest.xml` 声明 `CAMERA` + `uses-feature camera` / `camera.autofocus`（均 `required="false"`）→ APK 里扫码不再因权限未声明被 `onPermissionRequest` 直接拒绝 | `android/app/src/main/AndroidManifest.xml` |
| REV-24 | `android:allowBackup="false"`：应用数据不再进 Auto Backup / D2D 云端 | `android/app/src/main/AndroidManifest.xml` |
| REV-25 | `npm run apk` 改走 `scripts/apk.mjs`（按平台选 `gradlew.bat` / `./gradlew`），并新增 `npm run apk:release`（缺签名会在 Gradle 配置阶段中止） | `package.json`、`scripts/apk.mjs`（新） |
| REV-26 | `package-lock.json` 恢复入库、`src/composables/useSafeArea.ts` 入库、`typescript` 由 `^5.6.3` 改精确 `5.6.3`（`npm install` 后生效） | `package.json`、git 索引 |

**验证**：`node --check scripts/apk.mjs` 通过；`vue-tsc --noEmit` 0 错误；vitest **14 文件 / 226 用例全通过**（批次 3 只动原生壳与脚本，前端用例不受影响）。

**文档同步**：`README.md`（「打包 Android」重写：`cap:sync` / `apk` / `apk:release` + 「release 签名」小节 + 相机权限说明改为「已进仓库 manifest」）；`AGENTS.md`（§3 加 `scripts/apk.mjs`、§7 加签名前置要求、§8 加 `apk:release`、§10 坑位 #61~#63、§11 加 release / 权限两行）。

**有意未做 / 已知代价**：

- `minifyEnabled false` 保持不变（REV-39）：Capacitor 桥接靠反射，现有 `proguard-rules.pro` 没做回归；开启需要真机回归兜底——需求方 2026-10-24 定案不开 minify，此项不再是待办。
- `base`、CSP、`host: '0.0.0.0'` + `allowedHosts: true`（REV-38）未动：它们绑在具体部署方式上，改错会让线上白屏——需求方 2026-10-24 定案维持现状，此项不再是待办。
- 本机 `node_modules` 里仍是 TS 5.9.3，`package.json` 的 `5.6.3` 要等下一次 `npm install` 才落盘 —— 在那之前 `npm run typecheck` 用的还是 5.9.3。
- 旧的 `home1234` 口令已经外泄过（进过 git 历史），**换钥时务必用新口令**；`release.keystore` 从未入库，不需要吊销。



---

## 13. 批次 4 落地记录（2026-10-24 · 一致性）

**已修**（编号同 §3 / §4）：

| 编号 | 改动 | 位置 |
| --- | --- | --- |
| REV-10 | `dict.upsert` / `dict.reset` 保存后**自动**调用 `items.recomputeAll()`——此前 JSDoc 写着「调用方记得调」，字典页从来没调过 | `src/stores/dict.ts` |
| REV-11 | 提醒设置（开关 / 时刻）一变即重排程（App 层 watch，避免 store↔composable 环）；`scheduleNative` 把**取消旧排程挪到 remindEnabled 判定之前**——关闭提醒不再「第二天照弹」 | `src/App.vue`、`src/composables/useReminder.ts` |
| REV-13 | `inboundDefaults` 对自带 / 历史位置做**可用性校验**（未删未停用），孤儿引用回落第一个启用位置；`locationDistribution` 新增**「未分配」桶**（`locationId: null`，恒排最后），占比合计回到 100% | `src/domain/inbound.ts`、`src/domain/stats.ts` |
| REV-14 | `createItem` 新增 `aliasKey` 注入，`dictKey` 落**字典规范词根**（store 全量传 `foodKeyOf`）；`foldKeyOf` / `findRecentByName` 改为 `(dictKey ?? name)` **先过别名解析再退 normalizeName**——旧数据（dictKey=原始名）的别名折叠从「形同虚设」变为生效；编辑页改名同步刷新 dictKey | `src/domain/itemFactory.ts`、`src/domain/grouping.ts`、`src/domain/inbound.ts`、`src/stores/items.ts`、`src/views/ItemEditView.vue` |
| REV-15 | 新增 `data/sync.ts`（BroadcastChannel）：Dexie 所有写路径成功后广播；其它窗口收消息后**自动重读全部 store** 并提示「已同步其它窗口的改动」（防抖 300ms）。把「静默覆盖」变成「最多滞后一个通知周期」 | `src/data/sync.ts`（新）、`src/data/dexie/sources.ts`、`src/App.vue` |
| REV-17 | 输入类字号提到 **16px**（`.field-input` / `.field-textarea` / SearchField），防 iOS / 部分 WebView 聚焦整页放大；视觉尺寸由外框高度与内边距承担 | `src/styles/index.css`、`src/components/SearchField.vue` |
| REV-18 | 概览卡三个数字统一**同一套口径**（全量、排除「明天再说」）：「已过期」改从 `buildTodayTodo` 的结果里数，不再读受搜索/位置筛选影响的 `rows` | `src/views/StockView.vue` |
| REV-19 | 「清除已购」：`ConfirmSheet` 二次确认 + `clearDone` 改**一次 bulkPut** 并返回快照 + toast「撤销」走 `restoreMany` 整批回滚 | `src/stores/shopping.ts`、`src/views/ListView.vue` |
| REV-20 | `customName` 清空时按 **old 值**判定 selected 来源：来自输入的复位为 null（`canAdd` 变 false）；点九宫格导致的清空（selected 是格子名）不受影响 | `src/components/QuickAddSheet.vue` |
| REV-21 | 组卡默认展开（≤2 份）**跟随份数变化重算**：`watch(group.members.length)` | `src/components/ItemGroupCard.vue` |
| REV-22 | 页头「需买 N 件」改数 `shopping.pending`（未勾选），不再把已勾选/已入库算进去 | `src/views/ListView.vue` |
| REV-43 | `ShoppingRepository` 新增 `allIncludingDeleted()`；`generate()` 喂**含软删行**的全量清单——dismissed 集合不再恒为空；抑制时长收敛到 `DISMISS_DAYS`（domain 唯一定义，store 由它换算）；早期没写 `dismissedUntil` 的软删行按 `deletedAt` 距今 < 7 天兜底 | `src/data/repository.ts`、`src/data/dexie/sources.ts`、`src/stores/shopping.ts`、`src/domain/shoppingRules.ts` |

**验证**：`vue-tsc --noEmit` 0 错误；vitest **16 文件 / 253 用例全通过**（新增 `shoppingRules.test.ts` 13 例、`itemFactory.test.ts` 4 例，扩 grouping / stats / inbound / sanitize 共 19 例）。

**有意未做 / 已知代价**：

- **REV-13 的「删除位置时迁移在库记录」未做**：`canDeleteLocation` 本就禁止删除**有在库物品**的位置，孤儿只能来自「停用位置上的历史记录」或备份导入——「未分配」桶 + 入库过滤已覆盖这两条路径的后果。
- **REV-15 只做检测 + 重读，不是并发写保护**：两个窗口在通知周期内同时写仍会互相覆盖；根治需要 `table.update(id, patch)` 化或字段级 merge，涉及全部写路径重构——需求方 2026-10-24 定案不做（检测 + 自动重读已覆盖日常场景），不再是待办。

---

## 14. 批次 5 落地记录（2026-10-24 · 优化）

**已修**（编号同 §3 / §6）：

| 编号 | 改动 | 位置 |
| --- | --- | --- |
| REV-28 | 新增 `composables/useNow.ts`（模块级单例：60s 心跳 + `visibilitychange` 即时刷新），`useToday()` 返回响应式「今天」；按天计算的 8 个组件全部接入（StockView / TodayTodo / ItemCard / ItemGroupCard / StocktakePanel / GroupConsumeSheet / StatsView / QuickAddSheet 预览），PWA 挂后台跨零点不再停在昨天 | `src/composables/useNow.ts`（新）+ 8 处接入 |
| REV-29 / 47 | 搜索关键字与名称匹配走 `normalizeName`；`planShopping` 的幂等键 / 在库名单 / `lastConsumedQty`、`topWasted` 的聚合键全部归一化——「番茄（西红柿）」与「番茄」不再各占一条 | `src/views/StockView.vue`、`src/domain/shoppingRules.ts`、`src/domain/stats.ts` |
| REV-30 | `stats` 新增 `epochOf` 守卫：`monthStats` / `wasteTrend` / `turnoverDays` 对脏 `at`（NaN / 字符串 / 非正数）跳过该条，不再产生 `'NaN-NaN-NaN'` 静默少算 | `src/domain/stats.ts` |
| REV-31 | `compareLocations` 的 `envLabel` 改为 `ENV_MAP[loc.env].label`（此前返回枚举值 `'chilled'`，恰好没被直接消费才没暴露） | `src/domain/shelfLife.ts` |
| REV-32 | `undoConsume` 改**数量对账**：`cur.quantity === log.quantity` 视为整条消耗不加回，否则回加 `log.quantity`——「部分消耗 + 整条消耗」后撤销前者不再漏加；两次数量恰好相等的极端情况按「不加回」处理（宁少勿错） | `src/stores/items.ts` |
| REV-33 | merge 导入读现状改用 `allIncludingDeleted()`（tombstone 参与新旧比较，本地删除不被旧备份复活）；位置排序重排移进**同一事务**（不再出现「已导入却报失败」，也不再逐行刷 `updatedAt` 挡住位置改名） | `src/data/backup/import.ts` |
| REV-34 | `main.ts` 全局接 `QuotaExceededError`（unhandled rejection → 可见 toast「存储空间已满…」）；App 启动时申请 `navigator.storage.persist()`（被拒不影响功能） | `src/main.ts`、`src/App.vue` |
| REV-35 | `addMany` 合并候选改 **折叠键 Map 索引**（O(n)，此前每 input 全量重建数组 O(n²)）；`locationRules` 新增 `countsByLocation` 一次聚合，位置管理页 / 筛选条接入 | `src/stores/items.ts`、`src/domain/locationRules.ts`、两处 UI |
| REV-36 | `NO_LOCATION` 的真实 NUL 字节改为 **`'\u0000none'` 转义序列**（运行时字符串完全一致），`shoppingRules.ts` 恢复为纯文本，diff / 搜索 / review 重新可用 | `src/domain/shoppingRules.ts` |
| REV-37 | PWA 通知优先走 `navigator.serviceWorker.ready.showNotification`（Android Chrome 禁止页面直接 `new Notification`），构造函数只作桌面兜底 | `src/composables/useReminder.ts` |
| REV-40 | `tsconfig` 显式加 `node` types 与 `vitest.config.ts`；`preview` 脚本去掉与配置打架的 `--port 4173`；`assetsInlineLimit` 注释改为真实理由 | `tsconfig.json`、`package.json`、`vite.config.ts` |
| REV-41 | 文档漂移清理：ARCHITECTURE「APK 尚未产出 / 跨零点」、domain/README `SCHEMA_VERSION = 1`、AGENTS「base 相对路径」与 `@capacitor/app` 现状 | `docs/ARCHITECTURE.md`、`src/domain/README.md`、`AGENTS.md` |
| REV-44 | 折叠键纳入 **unit**（`locationId|名称键|unit`）——「牛奶 2 盒 + 1 袋」不再折成「共 3 盒」，`findMergeTarget` 同理不跨单位合并 | `src/domain/grouping.ts` |
| REV-45 | `expiryCompatible` / `planBulkMove` 过 `isDateStr` 守卫（脏日期按「无到期日 / 今天」处理，不再穿透 `parseDate` 抛错）；`planShopping` 时间窗加 `at <= now` 上界（时钟跳变的未来时间戳不算「最近」） | `src/domain/grouping.ts`、`src/domain/bulk.ts`、`src/domain/shoppingRules.ts` |
| REV-46 | 删除死代码 `todayOverview`（与 `buildTodayTodo` 规则分叉）；`turnoverDays` 补 `status === 'finished'` 过滤并**修正钉死错误行为的用例** | `src/domain/stats.ts`、`src/domain/__tests__/stats.test.ts` |
| REV-48 | `sanitize` 日期改**往返校验**（`toDateStr(parseDate(v)) === v`）：`2026-13-01` / `2026-02-31` 这类「格式对但日历上不存在」的日期按非法处理（此前会静默归一成 2027-01 / 03-03） | `src/data/backup/sanitize.ts` |
| REV-49 | `quantity: 0` 是合法值（「明确清空」）原样保留，负数 / 非数字才归 1；物品 / 日志 / 清单项的 `name` 入库前 `trim()`；修正与实现相反的注释 | `src/data/backup/sanitize.ts` |
| REV-50 | `grouping` 复用 `price.round2` 与 `dates.todayStr`（删掉本地两份实现）；`locationRules` 的「有效位置」谓词收敛为 `inStockAt` 一份；删除 `freshness.test.ts` 里逐字节重复的 describe 块 | `src/domain/grouping.ts`、`src/domain/locationRules.ts`、`src/domain/__tests__/freshness.test.ts` |

**验证**：`vue-tsc --noEmit` 0 错误；vitest **16 文件 / 253 用例全通过**。`npm run build` 按本轮约定未在沙箱执行，需在普通终端补跑一次。

**有意未做 / 已知代价**：

- REV-38（`base` / CSP / `allowedHosts`）与 REV-39（minify）：需求方 2026-10-24 定案不做，不再是待办。
- 持久存储的状态展示 UI：需求方 2026-10-24 定案不做（`persist()` 静默申请保留）。
- REV-15 的深度并发写保护：定案不做。产品方向 #4（撤销历史面板）与 #7 的 CSV 导出已落地（F1/F2）；#6 虚拟滚动转批次 F10（规划中，见 §15）；#8 无障碍补全仍开放；#9 真机走查待设备可用后补。


---

## 15. 后续批次 · v1.1 功能规划（2026-10-24 与需求方确认）

> 批次的**登记与状态**以 `docs/BATCHES.md`（批次台账）为准：完成批次、新规划批次都必须当天在台账登记一行，本节承载需求明细与落地记录。

> 本章是**已确认的功能需求**（优化 / 修复条目不在此列——优化与修复随批次 4/5 已闭环；
> 性能与健壮性条目中仅虚拟滚动立项为批次 F10，其余经需求方 2026-10-24 定案不做）。
> 每项落地时在本章补「落地记录」小节，与 §10~§14 同一格式。

### 批次 F1 · 消耗撤销历史面板

**需求**：把「撤销」从 toast 的 5 秒单槽位升级为「最近操作」列表。

- 入口：「我的」页或库存页（建议先做「我的」→「最近操作」，不打扰高频动线）。
- 数据源：`ConsumeLog` 已是完整流水，**不需要新表**——按时间倒序展示最近 N 条，
  每条带「撤销」；撤销逻辑复用 `items.undoConsume`（单条）与 `undoBulk`（批量快照，
  目前只在内存，见边界）。
- 边界：批量操作的撤销快照（`BulkOp`）只在内存，刷新即失效——面板里对这类操作
  要么标注「刷新后不可撤销」，要么把 `BulkOp` 落库（倾向前者，先不扩表）。
- 涉及：新 view / 路由一条；`stores/items` 增加按需读取（`logs.since` 已有）。

### 批次 F2 · 统计导出 CSV / 分享图

**需求**：纯本地前提下，导出文件是与家人共享消费情况的唯一途径。

- 「统计」页加「导出」：CSV（月度消耗 / 浪费 / Top5 / 品类分布）走既有
  `downloadJson` 同款 `<a download>` 通道，WebView 不支持时降级「复制到剪贴板」。
- 分享图（可选，二期）：Canvas 绘制月度摘要卡 → 保存图片；不做社交分享 SDK。

### 批次 F3 · 通知点击直达物品

**需求**：原生壳的通知点击目前只打开 App，应跳到对应临期物品。

- `@capacitor/local-notifications` 的 `actionPerformed` 事件 → 取通知 id（`hashId(item.id)`
  已写进通知）→ 反查物品 → `router.push` 详情页。
- PWA 侧 `notificationclick` 事件同理（SW 已注册）；查不到物品（已消耗/已删）时落到库存页。

### 批次 F4 · 月末库存快照对比

**需求**：回答「这个月到底吃掉 / 浪费了什么」。

- 新增 `snapshots` 表（每月最后一天或次月首启时写一份在库摘要：`{ month, items: [{id, name, quantity, unit, price}] }`）。
- **升 `SCHEMA_VERSION`（2 → 3）与 Dexie version(3)，备份格式同步五处**（见 `data/README` 换表清单与 v2 的教训）。
- 「统计」页新增「本月 vs 上月」对比视图：消失的 = 吃掉/扔掉（与日志对账）、新增的 = 新购。

### 批次 F5 · 自定义食材图标

**需求**：图标当前固定取名字首字，允许用户选 emoji。

- `Item.icon` 字段语义不变（string），入库 / 编辑页加 emoji 选择器（内置常用食材 emoji 集 + 最近使用）。
- 无数据结构变化；组卡 icon 取 lead 的 icon，展开行各自显示。

### 批次 F10 · 实用性动线批次（2026-10-24 定案：实用性 ①②③⑥⑦ + 虚拟滚动；备份提醒 / 图标快捷方式定案不做）

**需求来源**：2026-10-24 需求方对实用性建议清单的挑选。六项：

1. **库存长列表窗口化渲染**：当前全量渲染组卡，几百件时首屏与滚动掉帧（`foldItems` + `sortByFreshness` 每次 computed 全量重算，§7 #6）。改为首屏仅渲染首屏数量、滚动按需追加；**不采用回收式虚拟滚动**——组卡动态高度 + 分组头 sticky + F8/F9 滚动体系刚收口，回收式偏移计算回归风险大，窗口化追加已覆盖「几百件」规模。
2. **消耗 / 入库后即时重算购物清单**：`planShopping` 目前只在启动时跑一次（`App.vue`），吃掉最后一盒鸡蛋后建议要等下次启动才出现。改为写动作后防抖触发 `generate()`（幂等，7 天抑制不受影响）。
3. **临期通知聚合成一条**：每件一条在到期高峰是 N 连击轰炸，用户会关权限。多条时聚合为「今日 N 件需要关注」一条，点击落库存页；单条保持现状（保留 F3 点击直达物品）。
4. **购物清单「复制为文本」**：家人未装 App 时，一键把按位置分组的清单复制为纯文本（纯剪贴板，不碰无网络底线）。
5. **新用户首启引导（3 步）**：讲解「环境决定保质期 / 位置是载体 / 同名折叠 + FEFO」三个核心概念，localStorage 标记只出现一次。
6. **过期物品一键登记丢弃**：过期物的浪费登记现在步数多，导致 `frequent_waste` 建议缺数据；组卡与待办对 over 态提供「扔掉了」快捷入口（二次确认 + 整份丢弃）。

**验证口径**：typecheck / test / build 三验 + `npm run preview` 手点（含安卓返回键；通知聚合属原生能力，逻辑层可测）。

**落地记录（2026-10-24 完成）**：

| # | 改动 | 位置 |
| --- | --- | --- |
| ① 窗口化渲染 | **增量窗口**而非回收式虚拟滚动（理由见下）：首屏 40 组，距底 600px 追加 30 组；筛选/搜索/视图变化重置窗口；段头全部照常渲染（数量 ≤10，成本可忽略）；底部「已显示 X/Y 组」防误判到底。**为何不用回收式**：组卡动态高度 + 分组头 sticky 依赖各自 `<section>` 包含块，回收式要在单容器做偏移计算，F8/F9 刚收口的滚动体系会被大面积重写；窗口化零偏移计算、零滚动跳动，代价（滚过的不回收）在几百件规模下可接受 | `StockView.vue`（`visibleSections` / `onListScroll`） |
| ② 即时重算 | watch `items.list` **引用**变化（items store 所有写操作都以 `load()` 换数组收尾，一次浅 watch 覆盖全部写路径）→ 防抖 800ms → `generate()`（幂等）；`ready` 判定挡住启动序列的重复执行；跨标签同步触发的重算幂等无害 | `App.vue` |
| ③ 通知聚合 | 单件保持独立通知（保留 F3 点击直达）；多件聚合一条「今日有 N 件需要关注」列前 5，id = `hashId('hs-daily-summary')`（点击反查不到 → 落库存页，与 F3 兜底同路径）；PWA 侧单件标题同步对齐 | `useReminder.ts` |
| ④ 复制为文本 | 新纯函数 `shoppingListText(groups)`（首行件数 +【组名】+「名称 ×数量单位」），只喂未勾选项；`copyToClipboard` 复用 F2 的导出通道 | `domain/shoppingRules.ts`、`ListView.vue` |
| ⑤ 首启引导 | 新组件 `OnboardingOverlay`（3 步：环境决定保质期 / 位置是载体 / 同名折叠 + FEFO）；出现条件 = 无 `hs.onboarded` 标记**且**库内无任何数据（老用户升级不看）；跳过与完成等价 | `components/OnboardingOverlay.vue`、`App.vue` |
| ⑥ 一键丢弃 | 三个落点：ConsumeSheet / GroupConsumeSheet 的 wasted 默认数量改**全部**（consumed 维持 1）；待办区过期行「扔掉」红底主按钮 + 第一位；组卡 lead 过期时 ✕ 红底白字。**preview 实测抓到漏改**：单份组 qty>1 走 GroupConsumeSheet 而非 ConsumeSheet，双弹层是平行路径（坑位 #69） | `ConsumeSheet.vue`、`GroupConsumeSheet.vue`、`TodayTodo.vue`、`ItemGroupCard.vue` |

**验证**：typecheck 0 错误；vitest 18 文件 / **271 例**全通过（新增 `shoppingListText` 3 例）；build 成功。preview（390×780，注入 524 物品 + 过期/临期样本）：引导 3 步走完且刷新不复现、窗口化 40→70→100 逐批追加且跨段正常、过期 ✕/待办红底 computed style 精确命中 `--danger`、扔掉过期牛奶 1.5s 内清单出现「牛奶 · 库存 0」（不刷新页面）、复制 toast、「返回键」#\/list → #\/stock、概览数字对账 524→522 全对。通知聚合与多标签重算属原生/多窗口能力，逻辑层已由代码审查与幂等设计覆盖，留真机走查。

### 批次 F11 · 设计与排版批次（2026-10-24 定案全做，规划中）

**需求来源**：2026-10-24 需求方对设计建议清单的全量采纳。八项：

1. **视觉焦点收敛**：fresh 态弱化为中性灰（点 / 进度条），只有 urgent / over 用醒目色，需要行动的条目自己浮出来。
2. **红绿色盲兜底**：fresh/over 不只靠色相区分；过期态加形状差异（实底徽标），文字 label 始终伴随色点。
3. **数字 `tabular-nums`**：金额 / 数量 / 剩余天数等宽数字，滚动与统计不跳动。
4. **固定头部紧凑化**：概览 chips 合并为单个 pill（「临期 3 · 过期 1」）、只显示非零项，小屏省纵向空间。
5. **底部空间 token 化**：`pb-[84px]` / `pb-[132px]` / `bottom-[-12px]` 等魔法数收敛为 `--fab-space` / `--actionbar-space`，吸底元素与列表让位同源取值（PITFALLS #16 族根治）。
6. **深色模式语义色对比度校验**：橙 / 绿 / 红语义色在 `#1C211F` 卡片底上过一遍（文字 ≥4.5:1、图形 ≥3:1）。
7. **触控目标审计**：步进按钮 / 筛选 pill / 复选框热区 ≥44×44（视觉可小，热区不能小）。
8. **空状态带主行动**：库存空 →「入库第一件」直开快速入库；清单空 → 解释自动生成规则。

**落地记录（2026-10-24 完成）**：

| # | 改动 | 位置 |
| --- | --- | --- |
| ① 视觉焦点 | `--state-fresh-*` 三变量改为引用既有中性 token（`var(--bg-sunken/--text-2/--text-3)`），浅深自动跟随；徽标、进度条、组内色条全部经变量生效 | `styles/index.css` |
| ② 色盲兜底 | 新增 `--state-over-solid(-fg)` token（浅 #8e2f27 / 深 #b0564d + 白字，对比 8.1 / 4.9:1）；组卡与待办区的过期徽标改实底 | `index.css`、`ItemGroupCard`、`TodayTodo` |
| ③ tabular-nums | StatCard 数字、QtyStepper 输入框、待办/组卡数量、消耗明细合计、我的页分布计数（StatsView 既有覆盖已全） | 6 文件 |
| ④ 头部紧凑 | 库存页三张 StatCard（约 64px）→ 一行 44px Pill（非零显示，「在库」恒显；沿用 statusFilter 互斥筛选）；数字不染语义色（留给列表徽标） | `StockView.vue` |
| ⑤ 底部 token | `--fab-space: 84px` / `--actionbar-space: 132px` 入 `:root`；StockView 列表让位、TabLayout 注释同步 | `index.css`、`StockView`、`TabLayout` |
| ⑥ 对比度校验 | 一次性脚本 48 项（文字 ≥4.5 / 图形 ≥3，浅深 × 徽标/进度条/文本/主色/环境点）：3 项不达标已修——浅色 soon bar #e0952f→#b8761f（2.19→3.30）、over bar #a9857f→#9a746f（2.93→3.65）、ENV_MAP 避光点 #5E6B78→#6a7886（深色卡 2.99→3.61） | `index.css`、`domain/types.ts` |
| ⑦ 触控 44px | Pill/位置条/待办按钮/清单文字按钮 min-h-10→min-h-11；复选框热区 before:-inset-2→-inset-[11px]（22+22=44）；组卡展开行 ✓/✕ 补热区扩展（28+16=44）；QtyStepper 原样（lg 44 / md·sm 36/32+扩 16 ≥44） | `Pill`、`LocationChipBar`、`TodayTodo`、`ListView`、`ItemGroupCard` |
| ⑧ 空态 | 清单空态改双行：主文案 +「吃完了的东西会自动出现在这里；也可以用上面的手动添加记一笔」（库存空态 F10 前已有主行动按钮） | `ListView.vue` |

**附带修复**：`domain/freshness.barColor` 默认值写 `var(--ink-3)`——`@theme inline` **不发布 CSS 变量**（真名是 `--text-3`），warn/none 份的色条颜色一直无效（坑位 #70）。

**验证**：typecheck 0 错误；271 例全过；build 成功。preview（390×780）实测：概览 pill 行 44px 且筛选互斥（点「已过期」→ 仅 1 卡 + 段头「已过期 1」，取消恢复）；fresh 徽标 #eff2f0/#5f6763、进度条 #6b736e 精确命中；过期徽标浅 #8e2f27 实底白字 / 深色 `data-theme=dark` 下 #b0564d；`--fab-space`/`--actionbar-space` 变量解析正确。

### 批次 F14 · 架构收编（2026-10-24 定案与落地）

**需求来源**：2026-10-24 架构师视角审查（UI 组件收编率不足导致的漂移问题：IconText 3 处用、徽标 4 处手写、段头 2 处照抄后漂移、Tab 骨架 4 处手写并产出 F12 bug）。

**新组件 / composable**：

| 名称 | 内容 | 收编位置 |
| --- | --- | --- |
| `FreshnessBadge.vue` | 六态徽标（状态色映射唯一住址，over 实底） | ItemGroupCard×2、TodayTodo、StocktakePanel（**顺带修 F11-② 漏改**） |
| `EnvDotLabel.vue` | 环境色点 + 名称（tone: sunken / on-tint / bare） | ItemGroupCard、TodayTodo、StocktakePanel |
| `GroupHead.vue` | 分组段头（sticky 吸顶出血 / plain 两档），间距统一 | StockView、ListView、ConsumeLogView（StatsView 卡内小标题**判定不适用**，防为凑数抽象） |
| `TabPageBody.vue` | Tab 页骨架（list / page 两模式，`@scroll` 转发），手写 `h-full flex flex-col` 被审计禁止 | StockView、ListView、MeView、StatsView、ConsumeLogView |
| `useConsumeFlow.ts` | 单件消耗动线（≤1 直执行 / 弹层 / toast 撤销）；返回值必须**解构**（嵌套 ref 模板不解包，实测坑） | StockView、TodayTodo |
| `useWindowedList.ts` | 窗口化渲染（40 起 / 30 追加 / 600px 触发）；ConsumeLogView 首次接入 | StockView（改用）、ConsumeLogView |
| `domain/price.fmtMoney` | 金额展示（`¥12.30` / null→`-`）；`合计 ¥…toFixed(2)` 三处收编 | ConsumeLogView、StatsView、ConsumeSheet、QuickAddSheet、ScanSheet、ShoppingInboundRow、RecentOpsView |

**三层防线**（针对「强调过封装仍漂移」的根因：约定不在改动发生处被看到 + 无第二次出现即抽的规则 + 无机器兜底）：

1. **约定层**：AGENTS 强制约定第 4 条（UI 先查组件表；同一视觉第 2 次必须抽）+ §6.1 组件优先条款。
2. **导航层**：AGENTS §11 新增「我要写一段 UI…先用组件」场景表（11 行映射）。
3. **机器层**：`scripts/audit-ui.mjs`（`npm run audit:ui`）——6 条规则 grep 已知反模式（徽标 / 色点 / 段头 / Tab 骨架 / 金额 / 左图右文），支持 `audit-ignore: <id>（理由）` 逐行豁免（前三行内生效；豁免必须带理由）；首轮抓出 16 处，修复 5 处真违规、豁免 11 处合理特例后归零。§12 自检清单三验改四验。

**验证**：typecheck 0 错误；vitest **274 例**全过（+3 fmtMoney）；`audit:ui` 0 违规；build 成功。preview 实测：五 Tab 页标题行对齐（top=28）、库存窗口化 40→70、消耗明细注入 60 条后 40→63、返回键 /me 正常。已知边界：IconText 的存量收编仅 MeView 备份提示行（其余 inline 场景为 WARN 级规则渐进收编）；stores 写后全量重读的优化仍按原结论等真机大数据量再评估。

### 批次 F15 · UI 走查落地方批（2026-10-25 定案与落地）

**需求来源**：2026-10-25 UI 设计走查（390×780 逐页截图，12 项发现），需求方定案除 #9（进度条维持现状）外全做，另报一个 bug（待办展开无法滚动）随批修复。

| # | 改动 | 位置 |
| --- | --- | --- |
| ★bug | **待办展开无法滚动**：待办住在库存页固定头（F8 体系），头部 flex-none 不可收缩、TabLayout 外壳 overflow-hidden——展开超过视口时底部条目不可达、列表被挤没、无任何滚动。修复：展开区 `max-h-[50vh] overflow-y-auto`（自己成为滚动区） | `TodayTodo.vue` |
| ① | 组卡三行化：名称+状态 / 数量·单价·位置 / **进度条+到期日同行**（到期日此前挤在属性行把位置标签 wrap 到第三行，每卡固定多占 ~20px） | `ItemGroupCard.vue` |
| ② | 待办紧凑化：>3 条自动切紧凑行（名称+徽标 / 数量+位置+✓✕小按钮+「明天」链接，行高约减半）；≤3 条保持大按钮 | `TodayTodo.vue` |
| ③ | 消耗明细头压缩：三张 StatCard → 一行文字摘要（N 笔 · 合计 · 扔掉 ¥）；类型分段与日期 pill 合并一行（日期组 `scroll` 横滑，390px 换行会错乱）；固定头 ~300px→~200px | `ConsumeLogView.vue` |
| ④ | 我的页 9 个入口合并「查看 / 管理」两张分组卡（卡内 divide 行），省 ~40% 纵向空间且主次立现 | `MeView.vue` |
| ⑤ | 统计页删「本月概览」三卡（与我的页同源同数字）；数字保留为 CSV 导出数据源 | `StatsView.vue` |
| ⑥ | REASON_LABEL `out_of_stock`「库存 0」→「没库存了」（组名+计数连读歧义） | `shoppingRules.ts` |
| ⑦ | 编辑页单位收敛：自由输入框收进「自定义…」胶囊（当前单位不在常用集时恒展开，编辑旧数据不丢字） | `ItemEditView.vue` |
| ⑧ | 待办条标题去「N 件」（数量在概览 pill，双写需用户自己对账）；计数保留在 aria-label | `TodayTodo.vue` |
| ⑩ | 消耗明细类型色条 3px→4px | `ConsumeLogView.vue` |
| ⑪ | 快速入库「加入」→「仅此一件」边框副按钮，与主按钮同行（原两个全宽按钮文案只差两字） | `QuickAddSheet.vue` |
| ⑫ | **near_expiry 别名去重**：临期替换按 `(dictKey ?? name)` 归一聚合（「番茄/西红柿」两条批次同时 urgent 曾各推一条），保留最早到期那份（FEFO）；旧数据 dictKey 为 null 退字面归一（与折叠兜底同口径）。**+2 单测** | `shoppingRules.ts` |

**验证**：typecheck 0 错误；vitest **276 例**全过；`audit:ui` 0 违规；build 成功。preview 实测（注入演示数据逐页截图）：三行卡一屏多看一张、紧凑待办展开后搜索框仍可见（限高生效）、明细压缩头 + 4px 色条、我的页两组卡、统计页从在库价值开始。走查 #9（进度条）按定案未动。

### 批次 F17 · 到期日填写简化（2026-10-25 定案与落地）

**需求来源**：需求方反馈「到期日与生产日期每次都要入库后进详情、点展开才能改，太繁琐」。定案 A+B+删预览表。

**现状痛点**：三个入库入口的到期日全是只读（快速入库一行 tip 预览、清单入库卡预览文案、扫码什么都没有）；编辑页日期字段折叠在「更多选项」且只有「手填保质期（天数）」——改日期要自己换算天数。

**落地**：

| 项 | 内容 |
| --- | --- |
| 数据口径 | 新增 `domain/shelfLife.manualDaysForExpiry(expireAt, storedAt, producedAt?)`：用户指定日期 → `manualShelfLife` 天数（基准 `producedAt \|\| storedAt`，与 computeExpiry 同口径；早于基准返回 null，UI 日期 min 挡入口）。**为什么走 manual**：它是「用户明确指定」的唯一载体（优先级最高、换位置不被字典覆盖），不动 schema、备份零成本。+3 单测 |
| 新组件 | `ExpiryEditRow.vue`：view（预览 + 修改）/ edit（今天/明天/3 天/一周胶囊 + date input + 恢复自动推算）两形态；`minDate` prop 供编辑页放宽到入库日 |
| A · 三入口 | QuickAddSheet（只读 tip → 行，提交换算落库；换食材重置指定日期）、ScanSheet（**新增**该行——原本连预览都没有；doInbound 带 expiry）、ShoppingInboundRow（只读预览 → 行；emit 链带出 → `inboundOne` 挂 manualShelfLife） |
| B · 编辑页 | 「到期日」主字段（`pickedExpiry` 双向 computed：日期形态 ⇄ manualShelfLife 天数形态）；「手填保质期（天数）」输入退役；生产日期/单价/备注维持折叠；**删「各位置到期日预览」表**（手填后失去意义；换位置决策已有带预览的 LocationPickerSheet） |
| 附带修复 | QuickAddSheet 深链 `?quickadd=1` 挂载即打开时 `watch(modelValue)` 不触发、`locId` 恒 null（位置不预选、到期日行不出现）→ watch 加 `immediate: true` |

**验证**：typecheck 0 错误；vitest **279 例**全过；`audit:ui` 0 违规；build 成功。preview 实测：三入口行渲染正常；快速入库选「3 天」→ DB `manual=3 / source=manual / expireAt=+3`；编辑页「恢复自动推算」→ `manual=null / source=builtin / expireAt=+7`；编辑页无预览表、无天数字段。

### 批次 F18 · 清单收尾（2026-10-25 定案与落地）

**需求来源**：需求方确认批次顺序（F18→F19 发版真机→F20/F21）后开工；含需求方实际使用中暴露的三个清单问题。

| 项 | 内容 |
| --- | --- |
| ① 建议自动退场 | 新纯函数 `planShoppingRetirements(liveRows, suggestions)`：未勾选/未入库/未软删的自动项，若 `name|reason` 不在「当前成立原因全集」→ 退场。`stores/shopping.generate` 双向同步（先退场再补新）。**退场不设 `dismissedUntil`**：理由消失无从抑制，将来理由再成立（东西又吃完了）由 planShopping 正常重生——7 天抑制只属于用户主动 ✕ 路径 |
| ⚠️ 踩坑 | `planShopping` 的幂等过滤会把**已存在**的建议从返回集剔除——直接拿返回集当「成立原因集」，第二遍 generate 时所有老建议都不在集里 → 全部误判退场（preview 实测三行全退、清单清空）。修正：generate 喂给 planShopping 的 existing **只传软删行**（抑制依据仍在），返回集即为「全部成立原因」；新增判定改为「原因集中还没有活行的部分」。契约写进函数 JSDoc 与两处 README |
| ② 规则说明 | 页头 tip 升级为「自动生成 + 规则说明」展开块：三条规则（没库存了 / 临期替换 / 易浪费）+ 勾选/✕/手动项语义。默认收起不打扰高频动线 |
| ③ 手动添加收起 | 顶部整行输入收成虚线「+ 手动添加」按钮，点开展开（原输入框），加完自动收起 |

**验证**：typecheck 0 错误；vitest **282 例**全过（+3 退场用例：原因消失退场 / 手动·已勾选·已入库·已软删不退 / 同名不同 reason 不互抵）；`audit:ui` 0 违规；build 成功。preview 实测（真实使用数据）：stale 牛奶建议自动退场且未重生、酸奶/面包保留、需买数正确、说明与手动添加交互正常。

### 建议落地顺序

F1（复用现有流水，成本最低）→ F3（原生壳体验短板）→ F2 → F5 → F4（唯一动 schema 的，放最后单独升版）。

---

## 16. v1.1 批次 F1~F5 落地记录（2026-10-24）

| 批次 | 改动 | 验证 |
| --- | --- | --- |
| F1 最近操作（commit `1c00bf5`） | 新页 `/recent-ops`（PageShell）：最近 30 条消耗流水逐条撤销；物品已删则按钮置灰「已失效」（撤销需写回数量）；数据源即 ConsumeLog，无新表 | typecheck ✓ / 253 例 ✓ |
| F3 通知点击直达（`42341e0`） | App 启动注册 `localNotificationActionPerformed`：通知 id=`hashId(item.id)` 反查跳详情，查不到落库存页；冷启动竞态用 `pendingNavId` 挂起到 boot 完成 | typecheck ✓ |
| F2 统计导出 CSV（`ab034eb`） | `domain/statsCsv` 纯函数（BOM/CRLF/RFC4180 转义）+ `downloadText` 通用下载通道 + 统计页导出按钮，WebView 降级剪贴板 | +5 例 |
| F5 自定义图标（`f3ab502`） | `IconPicker`（内置 26 emoji +「你的常用」从既有物品频次统计，零新增存储）；`NewItemInput.icon` 可选；`isEmojiIcon` 区分默认首字 | +4 例 |
| F4 月末快照（`c7b5b5a`） | snapshots 表（Dexie v3 / SCHEMA_VERSION 3，备份 replace+merge 全链路同步）；`domain/snapshot`：次月首启幂等补写 + `diffMonth` 差集（折叠键与库存同一把）；统计页「本月 vs 上月末」 | +7 例 |

**收尾验证**：`vue-tsc` 0 错误；vitest **18 文件 / 268 用例全通过**；`vite build` 成功（precache 60 项 / 931 KiB）。

**有意未做 / 已知边界**：

- **F2 分享图**（Canvas 月度摘要卡）：留二期，先把 CSV 链路跑稳。
- **F3 PWA 深链**：需 `injectManifest` 自定义 SW（现为 generateSW），保持默认聚焦行为。
- **F4 跨多月缺口**：连续多月未打开 App 时只补最近一个月，更早月份无数据源，对比页按「无快照」明示。
- 真机走查（通知点击 / 扫码 / 盘点手势）仍待设备可用后补。
