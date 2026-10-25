# PITFALLS.md — 已知坑位全表（踩过的，别再踩）

> 2026-10-24 从 `AGENTS.md` §10 迁出（批次 D1 文档治理）。AGENTS 只保留**高频速查十条**与本文件指针，
> 完整的「坑 / 原因 / 对策」三列表都在这里。改代码前按关键词搜本表，别等踩了再看。
>
> ## 编号与维护规则
>
> - **保留历史编号原样**：V2/V3-CHANGELOG 与各目录 README 里有大量「坑位 #N」交叉引用，重编号会全部失效。
>   ⚠️ 历史上 **#16 / #17 各出现过两次**（早期追加时未对齐），这是已知遗留，不要试图「修复」它。
> - **新增坑位从 #69 起顺序编号**，一行一坑：`| # | 坑（现象） | 原因 | 对策（含出处） |`。
> - 表内引用其它坑位写「见 #N」；引用 AGENTS 章节写「见 AGENTS §N」；引用其它文档写相对路径。
> - 踩到新坑的**当天**就记进来 —— 坑位表是本项目「不二过」的唯一保险。

| # | 坑 | 原因 | 对策 |
| --- | --- | --- | --- |
| 1 | `vue-tsc` 报 `ERR_PACKAGE_PATH_NOT_EXPORTED: './lib/tsc'` | TypeScript 7 移除了该导出 | **锁 `typescript@5.6.3`**，不要升级 |
| 2 | 具名导入 `.vue` → `[MISSING_EXPORT]` | `<script setup>` 无具名导出 | 见 AGENTS §9 组件导入 |
| 3 | `dict.resolve.value` 编译报错 | Pinia setup store 已解包 | 去掉 `.value` |
| 4 | `dist/icons/` 缺失、预缓存条目少 | 图标放在项目根 `icons/` 不会进 dist | 图标必须放 `public/icons/`，`gen-icons.mjs` 已指向该目录 |
| 5 | 用 `curl` 探测资源返回 200 误判成功 | SPA fallback 会把任何路径返回 index.html | 必须校验 `content-type`（如 `image/png`） |
| 6 | 原生壳里改了代码 APK 还是旧的 | WebView 加载本地资源，SW 缓存了旧版本 | `main.ts` 必须 `if (!Capacitor.isNativePlatform()) registerSW(...)` |
| 7 | 安卓上 SCHEDULE_EXACT_ALARM 崩溃 / 通知不弹 | Android 12+ 精确闹钟需特殊权限 | `LocalNotifications.schedule({ schedule: { at } })` **不设 `exact`** |
| 8 | 通用合并函数对 `ConsumeLog` 类型报错 | `ConsumeLog` 无 `updatedAt` | 合并键用 `updatedAt ?? createdAt` |
| 9 | 用了某个 Vant 组件却报 `VanXxx is not defined` | `components.d.ts` 未生成 / 未覆盖该组件 | 重启 `dev` 让 `unplugin-vue-components` 重新生成 `src/components.d.ts`；仍缺失则在文件里手动补一行 `VanXxx: typeof import('vant/es')['Xxx']` |
| 10 | Capacitor 报 JDK 版本不对 | Capacitor 8 需 JDK 21 | 装 JDK 21 并设 `JAVA_HOME` |
| 11 | 部署工具报 `domainPrefix is required` | 必填项遗漏 | 发布时显式传 `home-steward` |
| 12 | Bash 里 `cd` 到含反斜杠的中文路径失败 | 反斜杠被吞掉 | 一律用**正斜杠** |
| 13 | 打开 `/item/new` 显示「该物资不存在或已删除」、标题是「编辑物资」 | 单一路由 `/item/:id` 时代：静态路由 `/item/new` 会抢在 `/item/:id` 前匹配，`route.params.id` 为 `undefined`，而 `ItemEditView` 判定 `isNew = id === 'new'` | **F20 起反转**：路由按消费/表单拆分（`/item/:id` 详情、`/item/:id/edit` 编辑）后，静态 `/item/new` 是**必须**的（否则新增落到详情页），且 `ItemEditView` 判定必须写成 `isNew = !params.id || params.id === 'new'`（静态路由下 params.id 是 undefined）。教训：静态段永远优先于参数段，新增静态路由时同步审计所有 params.id 消费方 |
| 14 | Vant 迁移后按钮/选中 chip 的文字全是黑色、字号字重失效 | CSS 层叠里**分层比较先于选择器权重**：Vant 自带的 unlayered 全局规则（`input,button,textarea{color:inherit;font:inherit}` 等）压过 `@layer utilities` 里的所有 Tailwind 工具类 | 保持 `vite.config.ts` 的 `vantCssLayer()` 插件与 `index.css` 首行的层序声明，别把规则写到 unlayered 位置。见 AGENTS §6.1（vantCssLayer 层序规则） |
| 15 | 整页忽宽忽窄（库存页 480px 溢出屏幕、消耗明细页只有 323px） | `van-config-provider` 渲染出一个真实 div，作为 `#app`（flex 容器）唯一的 flex item，`width:auto` 退化成「内容宽度」 | `index.css` 的 `@layer components` 里有 `.van-config-provider{width:100%}`，勿删；`#app` 的居中与 480px 上限由内部根容器的 `max-w-[480px] mx-auto` 负责 |
| 16 | **发布后用户反馈「线上还是旧的」，但 curl 抓到的 index.html 已是新资源哈希** | PWA 的 Service Worker 早在上一版就把 index.html 与 assets 预缓存了；`skipWaiting` + `clientsClaim` 只保证**新 SW 接管**，不会让**已渲染的旧页面**重绘，用户眼前仍是旧 UI | ① 先用 curl 比对 `index.html` 的资源哈希，确认服务端确实是新版（这一步排除部署失败）；② 用户侧硬刷新或清站点数据一次；③ 长期由 `main.ts` 兜底：`controllerchange` 时 reload 一次 + 每 30 分钟在页面可见时 `reg.update()`。**不要因为它「看着没变」就反复重新发布** |
| 17 | 证明了错的域名：看到形如 `home-steward-42425.app.workbuddy.host` 的链接且打不开 | 那不是本项目的发布地址（本项目固定为 `home-steward` 前缀） | 以 `https://home-steward.app.workbuddy.host/` 为准，其余一律忽略 |
| 16 | 顶栏下方 / 合计条下方露出一条卡片边（滚动时卡片像"穿过"了吸顶、吸底条） | `sticky` 的偏移量相对**内容盒**计算：滚动容器的 `padding-top/bottom` 会把吸顶 / 吸底条朝内推一个 padding，条与容器边缘之间留出一条缝 | 带 sticky 条的页面，容器必须 `pt-0`（必要时 `pb-0`）——见 `TabLayout.padClass`；留白改用页面内的普通流占位元素（`StockView` 顶部的 16px 占位 `<div class="h-4">`、`ConsumeLogView` 的 `h-5`）。**底部镜像**（2026-10 浏览器实测抓到）：`ConsumeLogView` 的滚动容器因空态留白保留了 `pb-3`，合计条 `sticky bottom-0` 被内推 12px，卡片从条下 12px 缝里穿行露出——修法是吸附位**下探封缝**：`bottom-[-12px]`（数值 = 容器 pb），条内自带的 `pb-[calc(12px+safe-area)]` 保证文字不贴屏。详见 AGENTS §6.3 与 `src/styles/README.md`「吸顶层」规则 5 |
| 17 | 底部 Tab 的「库存」图标看着像缺一角、画不全 | 内联 SVG 的 `d` 被写坏（圆弧参数 `a2 2 0 0 0` 掉了一个 `2` 变成 `a2 0 0 0`），外加几条超出框体的辅助线，小尺寸下就成了「残图」 | 换图标时**改完要在浏览器里放大看一眼**；缺参数的 path 不报错、只是画得不对。图标一律内联 SVG + `currentColor`，笔画粗细对齐（1.9–2.2） |
| 18 | 用户手选「浅色」但系统是深色，整页还是黑的 | 深色变量挂在 `@media (prefers-color-scheme: dark)` 上，媒体查询无法被应用内状态覆盖 | 深色变量只挂 `html[data-theme='dark']`；`data-theme` 由 `index.html` 内联脚本（首帧前，读 localStorage 镜像 `hs.theme`）+ `useTheme` 维护。详见 AGENTS §6.4 与 `src/styles/README.md`「深色模式与主题色」 |
| 19 | 自定义主题色后按钮白字看不清 / 按钮陷进背景 | 主色直接拿来用，没做对比度校正（用户可能选荧光黄、近白、近黑） | 主色必须过 `domain/accent.ts` 的 `resolveAccent`（白字 ≥4.5、与底色 ≥3，文字优先），色阶由 `accentScale` 派生后写 inline style。不要在 CSS 里 `color-mix()` 派生——做不了「不达标继续调」的闭环 |
| 20 | 换了主题色， Vant 按钮/开关还是老绿色 | `--van-primary-color` 写死了 hex | 指向 `var(--primary-600)`；同理 Vant 的颜色变量一律引用项目 token，别写死 |
| 21 | 概览卡显示「今日待吃 3」，点进去待办只有 2 条；或待办里没有它、通知却弹出来 | 数字、列表、通知三处各自实现了一套筛选逻辑，规则一分叉就自相矛盾 | **三处都调 `domain/todo.buildTodayTodo()`**，禁止各筛各的。见 `docs/V2-CHANGELOG.md` §2.1 |
| 22 | 批量入库 20 件卡顿 | 循环调 `items.add()`，而它内部每次都 `await load()`（全量重读 items + logs） | 批量一律走 `items.addMany()` / `bulk*` 方法：`bulkPut` + 单次 `load` |
| 23 | 覆盖导入后旧条码映射残留 | 新增表时只改了 `dexie/sources.ts` 的 `wipe()`，忘了同一文件的 `transaction()` 表清单 | 改表结构要同步**五个地方**（见 `src/data/README.md`「改表结构必须做五件事」） |
| 24 | 条码扫出来永远匹配不上 | `BarcodeEntry.code` 被当成 number 存/传：EAN-13 有前导 0，`Number("0123…")` 会丢 0 | 全链路用 `string`，包括输入框与 `byCode()` 的查询参数 |
| 25 | 关掉扫码页后摄像灯一直亮、持续耗电 | 只调了 `scanner.stop()`，没有显式停视频轨 | `ScanSheet.stopScanner()` 三步：`stop()` → `clear()` → **`video.srcObject.getTracks().forEach(t => t.stop())`** |
| 26 | 长按列表想滚动，却逐张误触进入多选 | 长按计时没有监听 `pointermove` | `ItemCard` 在位移 > 10px 时取消计时。见 `src/components/README.md`「长按防误触」 |
| 27 | 「明天再说」之后物品从库存列表消失了 | 实现时顺手改了 `expireAt` | `snoozeUntil` **只影响待办与通知**，绝不碰 `expireAt`；物品仍在「紧急待吃」分组里 |
| 28 | v2 新字段在旧数据上炸了 | 旧 IndexedDB 记录与 v1 备份里没有 `snoozeUntil` / `inboundItemId` | 这两个字段声明为**可选**，读取时一律 `?? null`，不写 `item.snoozeUntil > now`（依赖隐式转换很脆） |
| 29 | 快速入库弹层滚到底，「加入」按钮下方仍露出滚动内容 | 吸底按钮条是 `sticky`，被钳制在包含块（滚动容器**内容盒**）内；容器自己的 `padding-bottom` 让按钮条永远差一个 pb 到不了弹层底边 | 滚动容器**不给**与 sticky 元素同侧的 padding，留白由 sticky 条自己的 pb 承担（见 `QuickAddSheet`） |
| 30 | 多选态（`?select=1`）分组头悬在距顶 ~55px：上方漏卡片、下方盖住第一张卡的顶部 | 分组头吸顶偏移用的是筛选条实测高度，但多选态筛选条已被 `v-if` 移除，偏移量没跟着变 | 吸顶偏移的**邻居被 v-if 掉时偏移必须同步变**：`groupTop` 在 `selectMode` 下返回 `-1px`（见 `StockView`） |
| 31 | 清单写「西红柿」、历史里存「番茄」，入库默认值还是落到第一个位置 | 以为 `normalizeName` 能等同义词——它只做全角 / 括号 / 空格 / 大小写的归一，**没有同义词表** | 需要别名匹配就给 `domain/inbound` 传 `AliasKeyResolver`（调用方传 `data/dict` 的 `foodKeyOf`）；domain 不得反向依赖 data，与 `ShelfLifeResolver` 同一套路 |
| 32 | 选项对象里声明了却**从没被读**的参数（`remindEveryDays` 就是这样躺了两个版本：备份提醒两种情况都走 `firstAfterDays`，用户 7 天被念一次） | 加了参数就当实现了，没有用例约束；也没有人回头读一遍函数体 | ① 新增可配参数时补一条**专门验证它被用到**的用例（如「备份过走 30 天门槛、未备份走 7 天」）；② 改纯函数前先读一遍函数体，确认每个参数都真的参与了计算 |
| 33 | 一条脏备份记录（`storedAt: 0`）就让「我的」「库存」双主 Tab **永久白屏**，且数据 100% 在本机、无副本可回滚 | `validateBackup` 只校验信封（app 名/版本/数组在不在），记录一条不校验就 `bulkPut`；`storedAt: 0` 穿透到 `monthKey(0)` → `(0).slice is not a function` | **三层防御**：① `data/backup/sanitize.ts` 在写库前清洗（能修的修、缺 id/name 的丢、**计数上报**）；② `domain/dates.isDateStr` 守卫；③ 各消费点脏值跳过。见 AGENTS §5.7。**新增按日期聚合的函数时照抄 `dateOf()` 守卫** |
| 34 | 同一物品在库存列表里出现两次 | 先按新鲜度分段、再折叠同名组 → 同名组被切到「临期」和「新鲜」两段 | **顺序固定为 `foldItems → sortByFreshness → groupBy*`**，绝不能反。见 §5.6 |
| 35 | 折叠后「名字是西红柿、颜色按番茄」 | 组卡逐份算新鲜度再合并/取最优 | 状态色 / 徽标 / 进度条**一律取 `group.lead`**（`freshnessOf(group.lead, …)`） |
| 36 | `bg-over-bar` 工具类**不报错但静默失效**（柱状图透明） | `--state-*-bar` 没注册进 `index.css` 的 `@theme inline`，Tailwind 不会为它生成工具类 | 用 `var(--state-over-bar)` 引用；要用工具类就先在 `@theme inline` 注册。同理 `--sunken` 不存在，正确名是 `var(--bg-sunken)` |
| 37 | 趋势图看起来「每月各有高峰」，读不出在变好还是变坏 | 每根柱子各自归一化（`amount / 该月最大值`），等于把一张图拆成几张互不相干的图 | 同一组柱子**共用一个全局分母**（`Math.max(...points.map(p => p.amount))`） |
| 38 | 盘点时刚判过的物品又冒出来 | 队列实时读 `items.active`，而每判定一次就消耗掉一件，列表越判越短 | `StocktakePanel` 的 `queue` 是**进入时的快照**（`props.rows.map(r => r.item.id)`），不跟 store 走 |
| 39 | 点「还在」之后统计里多出一堆「消耗 1 个」的假记录 | 盘点三个动作都走 `consume` 写日志 | 「还在」**只推进游标，绝不写日志**。盘点里绝大多数结果都是「还在」 |
| 40 | 组卡取代 `ItemCard` 后，长按多选静默消失 | 折叠后列表主体换成了新组件，长按入口没跟着搬 | `ItemGroupCard` 完整复制 500ms + 10px 位移容差那套；**替换列表主体组件时先核对旧组件的交互清单** |
| 41 | 单份物品卡上出现「共 1 份」 | `dueSummary` 对所有组统一写份数 | 单份组：有日期写日期、无日期写**空串**。写「共 1 份」是噪音，还会让「牛奶 1 盒」看起来像被合并过 |
| 42 | 新设置项在旧数据上读到 `undefined`，页面白屏或分支全走默认 | `Settings` 上新增了字段，但旧 IndexedDB 记录与旧备份里没有它 | 两条路二选一：**可选字段**就 `?? 默认值`（坑位 #28）；**必填字段**（如 `stockViewMode`）就在 `normalizeSettings` 里**白名单校验后回落** `DEFAULT_SETTINGS`，别裸读 `raw.xxx` |
| 43 | 视图偏好做成两个布尔开关后互相打架 | 「分组」和「时间轴」是同一份列表的两种切法，互斥 | 互斥的视图偏好用**一个枚举**（`StockViewMode = 'group' \| 'timeline' \| 'flat'`），两个布尔会出现「都开 / 都关」两种无意义状态；「都不启用」本身就是枚举的一档 |
| 44 | 图标和旁边文字看着**没对齐**（图标整体下沉一截） | SVG 是 inline 元素，默认 `vertical-align: baseline`，浏览器把图标**底边**压在文本基线上，父容器 `items-baseline` 只会把图标一起拖走 | `.icon` 里的 `display: block` 不能删；对齐交给 `.it-icon`（`height: calc(1em * var(--it-lh))` + 内部居中）。见 `docs/ICON-TEXT-SPEC.md` §4 |
| 45 | 同一尺寸的图标在不同页面粗细不一样 | `stroke-width` 逐图标手写，改尺寸时忘记同步 | 描边**恒定 `--icon-stroke: 2.4`（viewBox 单位）**，不随尺寸缩放；SVG 上不再写 `width/height/stroke-width`，改由 `.icon .icon-{档位}` 给。改尺寸只换类，不同步数字 |
| 46 | 「浪费金额」长期是 **¥0**，看起来像「我没浪费钱」 | 三个入库入口（快速入库 / 扫码 / 清单行内）**都不传 `price`**，新建物品单价恒为 `null`；用户得回头进详情页一件件补，那条路径基本没人走 | 入库表单一律带单价输入，并实时显示「合计 = 数量 × 单价」兜住「把整份总价当单价填」的歧义。**新增入库入口时检查它有没有 price** |
| 47 | 金额口径在四处各写一份，最后一份直接漏了物品侧 | `bulk` / `ConsumeSheet` / `GroupConsumeSheet` / `sanitize` 各有一份规则，而 `sanitizeItems` 靠展开原样穿透 —— 手改过的备份里 `"price": "12.5"` 进库后 `price × 数量 = NaN`，整月统计烂掉 | **金额规则只有 `domain/price` 一份**：`normalizePrice` 归一、`amountOf(单价, 数量)` 算本次金额、表单走 `priceFromInput`。`null` = 没填价 ≠ `0` = 真的免费 |
| 48 | 累加金额时直接 `+= l.price ?? 0` | `?? 0` 只挡 `null`/`undefined`，挡不住字符串 —— `"5" + 5` 是**字符串拼接**，结果 `"55"` 再 `round2` 就是 `NaN` | 累加前先 `normalizePrice(l.price) ?? 0`（见 `domain/stats.ts` 三处） |
| 49 | `cap add android` 后 Gradle 配置阶段直接报 `Your project path contains non-ASCII characters` | 本机用户名是中文（`C:\Users\陆乔冰\...`），AGP 默认拒绝含非 ASCII 的工程路径（Windows 中文用户名是重灾区） | `android/gradle.properties` 加 `android.overridePathCheck=true`（AGP 官方开关，issuetracker 227627607）。这只是绕过检查，**真正修法是把工程 / SDK / Gradle 缓存都挪到纯 ASCII 路径**——但本机全在中文用户名下，靠下面 #51/#52 的编码修法兜底 |
| 50 | `./gradlew` 卡在 `Downloading gradle-8.x-all.zip` 然后 `SocketTimeoutException` | 本机网络到 `services.gradle.org` 不通 / 极慢 | `android/gradle/wrapper/gradle-wrapper.properties` 的 `distributionUrl` 改腾讯镜像 `https://mirrors.cloud.tencent.com/gradle/gradle-8.14.3-bin.zip`（`-bin` 不带 docs，路径更短，避免 Windows 超长路径解压失败） |
| 51 | 配了 `HTTPS_PROXY` 环境变量，Gradle 还是 `Connect to repo.maven.apache.org:443 … timed out` | **Java/Gradle 不读 `HTTP_PROXY`/`HTTPS_PROXY` 环境变量**，只能从 `gradle.properties` 的 `systemProp.*` 拿代理 | 在**全局** `GRADLE_USER_HOME/gradle.properties`（本机 `C:\Users\陆乔冰\.gradle\gradle.properties`）写 `systemProp.https.proxyHost=127.0.0.1` + `systemProp.https.proxyPort=<会话代理端口>` + `nonProxyHosts=localhost\|127.0.0.1`。⚠️ 代理端口是会话级的（`echo $HTTPS_PROXY` 拿），换会话要改；**别写进仓库的 `android/gradle.properties`**，否则换机器就炸 |
| 52 | 依赖都下完了，kotlinc 却报 `source file or directory not found: C:\Users\u9646u4E54u51B0\…DateMatch.kt`（一堆 .kt 找不到），连 `android.jar` 都标 `non-existent location` | 路径里的中文用户名在 Gradle→kotlinc worker 传参（argfile）时被按非 UTF-8 编码写/读，变成乱码 `陆乔冰`→`\u9646…`，文件自然找不到 | 全局 `gradle.properties` 给 daemon 强制 UTF-8：`org.gradle.jvmargs=-Xmx2048m -Dfile.encoding=UTF-8 -Dsun.jnu.encoding=UTF-8`（外加 `kotlin.daemon.jvmargs` 同款）。这样工程 / SDK / Gradle 缓存三条含中文路径都能正确寻址 |
| 53 | APK 里二级页（设置 / 消耗明细 / 编辑 …）的返回按钮压在手机状态栏下面，**点不到**，改了 `pt-[env(safe-area-inset-top,0px)]` 却毫无效果 | `env(safe-area-inset-top)` 在 **Android WebView 里恒为 0** —— 它只反映刘海 / 挖孔，不反映状态栏。而 targetSdk 36 下 WebView 是 edge-to-edge，页面从屏幕最顶端绘制，状态栏浮在上面。JS 也读不到 `status_bar_height`（没有对应 Web API，`window.innerHeight` 也不含状态栏） | 顶部安全区统一由 `src/composables/useSafeArea.ts` 下发：`main.ts` 在 `app.mount` **之前**调 `initSafeArea()`，用探针 div 读 `env()` 真值、原生壳里取 `max(env, 平台兜底)`（iOS 47 / Android 24），写成 `<html>` 的 inline `--safe-top`。组件一律 `pt-[var(--safe-top)]`，**禁止再写 `env(safe-area-inset-top)`**。见 AGENTS §6.3 |
| 54 | 盘点连着判第二件就被跳过，进度「1/20 → 1/19 → 1/18」越盘越少、收尾统计也不对 | `watch(() => props.rows, …)` 用来「筛选变化就重排队列」，但 `judge()` 里的 `consumeGroup()` 会 `load()`，`rows` 每判定一次都是新数组 → watcher 在 `await` 续体之前触发，把 `cursor` 归零并重置计数 | 盘点队列只做**进入时快照**、**不 watch `props.rows`**；筛选变化退出重进（重挂载组件）；`judging` 挡同一张卡连点（否则游标多前进一格）。见 `src/components/README.md`「队列必须是快照」 |
| 55 | 扫**一次**码入库十几件（一个条码建出十几条记录） | `html5-qrcode` 的解码回调**按帧触发**（fps 10），`onScan` 没有忙锁；`doInbound` 又是先 `addMany` 再 `stopScanner`，等落库完停扫时中间那几帧已经各入库一次 | `busy` 忙锁 + 同码 1.5s 时间窗去重；**先 `stopScanner()` 再写库**；未知码转表单前也要先停扫。见 `src/components/README.md`「ScanSheet 去重约定」 |
| 56 | 清单里两行同名（自动临期 + 手动）「全部入库」后撤销一行再入库，库存变成 3 份（实际 2 份） | `items.addMany` 会**跨 input 合并**同名同位置同到期日的记录，两行共享同一个 `inboundItemId`；而撤销按「1 行 = 1 物品」回滚，`restore` 的是合并后的整份数量 | `inboundAll` 调 `addMany(..., { merge: false })`：一条 input = 一条批次记录。见 `src/stores/README.md` 边界条件与 §5.6 |
| 57 | 备份里物品全都被清洗掉，导入却报「已覆盖导入（物品 0 位置 0 日志 0）」——本地数据已被清空 | 覆盖导入是「先 `db.wipe()` 再写入」；`validateBackup` 只校验信封，清洗一条不进不算失败。即使补了「先清洗后覆盖」，**清洗把物品全丢光**时照样清空 | `import.ts` 在覆盖前判定 `items 原始条数 > 0 且清洗后为 0` → 直接中止并返回原因；`BackupView` 在覆盖前把当前数据存成 JSON 快照，成功 toast 带「撤销覆盖」（仅本次会话有效） |
| 58 | 手改过备份的 `dict` 数组后，一进「保质期字典 / 快速入库 / 扫码 / 清单入库」就白屏，重启依旧 | `dict` 表当初没进 sanitize：`dictKey` 存成数字 → `buildCustomMap` → `normalizeName(123).trim()` 抛 TypeError；`computed` 抛错会让**依赖它的页面**永久白屏 | 新增 `sanitizeDict`：id/`dictKey` 空、`days` 不是「正整数或 `-1`」→ 整条丢弃并计数（不猜天数）；`env` 非法回落 `cool`；`dictKey` 过 `normalizeName` 并去重 |
| 59 | 导入备份后提醒开关反了、或「备份提醒」永远不弹 | `import.ts` 直接 `db.settings.save(data.settings)`；`id` 不是 `'singleton'` 时整条被忽略还留垃圾行，`"remindEnabled": "false"` 是**真值**，`lastBackupAt: "abc"` 让「上次备份」算出 NaN | 设置归一只有 `domain/settings.ts` 的 `normalizeSettings` 一份：`id` 恒 `singleton`、布尔用 `typeof`、时间戳非有限正数 → `null`、枚举白名单、数值 clamp。导入路径与 store 共用 |
| 60 | 用户把位置全删光，重启后预设位置又全回来了 | `ensureSeed` 用 `countAll() > 0` 判断「是否首次启动」；若用 `all()`（过滤软删除），删光后计数为 0 → 当首次启动重播种子 | 计数用 `Repository.countAll()`（**含**软删除行）；见 `src/data/README.md` 与 `src/data/seed.ts` JSDoc |
| 61 | release 的签名口令躺在仓库里，而签名文件根本不存在 | `android/app/build.gradle` 曾明文写 `storePassword 'home1234'` / `keyAlias` / `storeFile file('../../release.keystore')`，而 `release.keystore` 被 `.gitignore` 忽略、磁盘上也没有 → 口令已外泄，干净 clone 上 `assembleRelease` 必失败 | 签名只从 `android/keystore.properties`（git 忽略，模板 `keystore.properties.example`）或四个 `HOME_STEWARD_*` 环境变量读；`gradle.taskGraph.whenReady` 在 release 任务缺签名时**直接抛错中止**，绝不产出未签名包。见 `README.md`「release 签名」 |
| 62 | Windows 上 `npm run apk` 报 `'./gradlew' 不是内部或外部命令` | `cd android && ./gradlew` 只能在 POSIX shell 里跑，cmd 不认 `./` 前缀 | 统一走 `scripts/apk.mjs`：按平台选 `gradlew.bat` / `./gradlew`，`npm run apk` 与 `npm run apk:release` 都是它 |
| 63 | APK 里攒了几百条数据，换机时却在云端冒出来 | `AndroidManifest.xml` 的 `allowBackup` 默认是 `true`，Auto Backup / D2D 会把 WebView 数据（含 IndexedDB）带上云 | 显式 `android:allowBackup="false"`，与「数据 100% 本机」的产品底线一致；改权限 / 备份策略后要真机装一次确认 |
| 64 | iOS / 部分 Android WebView 上点输入框**整页放大且失焦不还原** | WebView 对字号 < 16px 的输入框聚焦时自动缩放页面 | 输入类字号一律 ≥ 16px（`.field-input` / `.field-textarea` / SearchField），视觉尺寸靠外框高度与内边距收，**别把字号调回 14**。见 `src/styles/README.md` |
| 65 | 改 `shoppingRules.ts` 后 `git diff` 全是二进制、内容搜索失效 | 源码里内嵌过**真实 NUL 字节**（`NO_LOCATION` 哨兵），git 按二进制处理整文件 | 字符串哨兵一律写**转义序列** `'\u0000none'`（运行时等价）；发现 diff 显示 Bin 先查 NUL：`node -e "…indexOf(0)"` |
| 66 | 「番茄」「西红柿」两条记录**永远折不到一张卡**，入库合并也失效 | 旧数据 `dictKey` 存的是原始输入名；`foldKeyOf` 若直接拿 dictKey 当键，别名解析永远轮不到 | `foldKeyOf` / `findRecentByName` 都要先 `(dictKey ?? name)` 过一遍 `aliasKey` 再退 `normalizeName`；新建物品必须传 `foodKeyOf` 给 `createItem`。见 §5.6 |
| 67 | 两个标签页同时开着，A 的消耗被 B 的编辑**无声覆盖** | Dexie 写是基于内存旧快照的整条 put，同版本多标签无内置广播 | `data/sync.ts` 用 BroadcastChannel 检测其它窗口的写入并自动重读全部 store（检测+同步，**不是**并发写保护）；根治要 `table.update(id, patch)` 化 |
| 68 | 「忽略的购物建议」下次打开 App 又冒出来 | 抑制依据住在**软删除行**里，而 `generate()` 曾把 `all()`（已滤软删）喂给 `planShopping`，dismissed 集合恒为空 | `generate()` 必须喂 `db.shopping.allIncludingDeleted()`；抑制时长只认 `DISMISS_DAYS`（domain/shoppingRules）这一处定义 |
| 69 | 消耗弹层的默认数量只改了一处，另一处行为没变 | `ConsumeSheet`（单条路径）与 `GroupConsumeSheet`（组路径）是**两条平行弹层**：单份组 qty>1 时 `askGroupConsume` 走的是 GroupConsumeSheet，不是 ConsumeSheet。v1.1 F10 改「扔掉默认全部」时漏了后者，preview 实测才抓到 | 改两个消耗弹层任一的行为时，**另一处必须同步**（默认数量、快捷档位、确认文案都各自维护了一份）；改动后用「单份多数量」物品各点一遍两条路径 | 
| 70 | `barColor` 的 warn/none 兜底色写在页面上**完全没生效** | 返回值写的是 `var(--ink-3)`，但 `--ink-*` 只是 Tailwind `@theme inline` 的**工具类命名空间**——`@theme inline` 不发布任何 CSS 变量，`--ink-3` 这个变量在文档里不存在，`background` 整条解析失败 | CSS（含 domain 返回给 style 的值）只能引用**真名** `--text-1/2/3`、`--bg-*` 等；`--color-*` / `--ink-*` 是工具类前缀，不是变量。发现颜色不生效先查变量名是否真在 `:root` 定义过 |
