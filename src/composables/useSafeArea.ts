/**
 * 顶部安全区（状态栏 / 刘海）高度 —— 全应用唯一的「读取 + 下发」点。
 *
 * ## 为什么需要它（根因）
 * APK 里 Capacitor 的 WebView 是 **edge-to-edge** 的（targetSdk 36，Android 15 起系统强制），
 * 页面从屏幕最顶端开始绘制，状态栏浮在内容之上。而 `env(safe-area-inset-top)`
 * 在 Android WebView 里**恒为 0** —— 那个变量只反映刘海 / 挖孔，不反映状态栏本身。
 * 于是 `pt-[env(safe-area-inset-top,0px)]` 等于没写：二级页（设置 / 消耗明细 …）的返回按钮
 * 直接压在状态栏下面，点不到。
 *
 * ## 取值顺序
 * 1. `env(safe-area-inset-top)`：iOS、带刘海 / 挖孔的浏览器与 WebView —— 这是**真实值**；
 * 2. 原生壳里 1 拿不到（= 0）→ 按平台兜底（iOS 47 / Android 24，单位 CSS px，数值上等于 dp）；
 * 3. 普通浏览器里保持 0 —— 浏览器自己已把页面让到地址栏下面，再叠加就多出一截空白。
 *
 * 解析结果写成 `<html>` 的 CSS 变量 `--safe-top`（inline 优先级高于 `index.css` 里的 `env()` 兜底值）。
 *
 * ⚠️ **组件只消费 `var(--safe-top)`，不要再各写 `env(safe-area-inset-top)`**。
 *    顶栏统一走 `components/NavBar.vue`（页面自渲染或 `PageShell` / `TabLayout` 外壳渲染），
 *    所以以后新增任何二级页都自动带上安全区，不需要作者记得补 padding。
 *
 * @example
 * // main.ts：启动时调一次，且**必须在 app.mount 之前**，否则首帧会先按 0 画、再跳一下
 * initSafeArea();
 *
 * @example
 * <!-- NavBar.vue：顶栏自己撑开安全区，可视标题行恒为 48px -->
 * <div class="pt-[var(--safe-top)] h-[calc(48px+var(--safe-top))]">…</div>
 */
import { ref, type Ref } from 'vue';
import { Capacitor } from '@capacitor/core';

/**
 * 拿不到真实安全区时的平台兜底值（CSS px，数值上等于 dp）。
 *
 * - `ios` 47：刘海 / 灵动岛机型的状态栏高度（`env()` 正常时根本用不到这一项）；
 * - `android` 24：AOSP 的 `status_bar_height` 默认值，绝大多数机型与它一致，有挖孔的会更高；
 * - `web` 0：浏览器里页面本来就在地址栏下面，不该再留白。
 */
const FALLBACK_TOP: Record<string, number> = { ios: 47, android: 24, web: 0 };

/** 当前生效的顶部安全区（px）。仅供需要参与 JS 计算的地方读；布局请直接用 `var(--safe-top)`。 */
const safeTop = ref(0);

/** 幂等标记：`initSafeArea()` 在应用生命周期里只该真正跑一次 */
let started = false;

/** 待执行的 rAF id。转屏 / 拖窗口会连发多次 resize，合并成一帧只量一次 */
let rafId = 0;

/**
 * 用一个不可见的探针元素读出 `env(safe-area-inset-top)` 的**计算值**（px）。
 *
 * 直接读 `var()` 拿不到求值结果（`getPropertyValue` 会原样返回 `env(...)`），
 * 所以必须让浏览器把它算进一个真实元素的 `padding-top` 上再读回来。
 *
 * @returns 解析出的像素值；DOM 不可用 / 浏览器不支持时返回 0
 */
function readEnvInsetTop(): number {
  if (typeof document === 'undefined' || !document.body) return 0;
  const probe = document.createElement('div');
  probe.setAttribute('aria-hidden', 'true');
  probe.style.cssText =
    'position:fixed;top:0;left:0;width:0;height:0;visibility:hidden;pointer-events:none;' +
    'padding-top:env(safe-area-inset-top,0px)';
  document.body.appendChild(probe);
  const value = Number.parseFloat(getComputedStyle(probe).paddingTop);
  probe.remove();
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * 解析当前应生效的顶部安全区。
 *
 * 原生壳里 `env()` 只覆盖刘海 / 挖孔那一段，状态栏本身仍要靠兜底值 ——
 * 两者取较大者，横屏挖孔（env 更大）与竖屏普通机型（兜底更大）都成立。
 */
function resolveSafeTop(): number {
  const envTop = readEnvInsetTop();
  const platform = Capacitor.getPlatform();
  if (platform === 'ios' || platform === 'android') {
    return Math.round(Math.max(envTop, FALLBACK_TOP[platform] ?? 0));
  }
  return Math.round(envTop);
}

/** 量一次并写入 CSS 变量（`<html>` 上的 inline `--safe-top`）。 */
function apply(): void {
  if (typeof document === 'undefined') return;
  const top = resolveSafeTop();
  safeTop.value = top;
  document.documentElement.style.setProperty('--safe-top', `${top}px`);
}

/**
 * 启动安全区测量：立刻量一次并写 `--safe-top`，之后在转屏 / 窗口尺寸变化时重算。
 *
 * 重复调用是安全的（只生效第一次）—— 页面里多处 `initSafeArea()` 不会重复绑监听。
 * 屏幕旋转后刘海可能从顶部挪到左侧，安全区会变，所以必须重算而不是只量首帧。
 *
 * @example
 * // main.ts
 * initSafeArea();
 * app.mount('#app');
 */
export function initSafeArea(): void {
  if (started || typeof window === 'undefined') return;
  started = true;
  apply();

  const schedule = () => {
    if (rafId) return;
    if (typeof requestAnimationFrame !== 'function') {
      apply();
      return;
    }
    rafId = requestAnimationFrame(() => {
      rafId = 0;
      apply();
    });
  };
  window.addEventListener('orientationchange', schedule);
  window.addEventListener('resize', schedule);
}

/**
 * 读取当前顶部安全区（响应式）。
 *
 * 单位是 CSS px。布局优先直接用 `var(--safe-top)`（纯 CSS、无需订阅）；
 * 只有在需要拿这个数字参与计算（如把某个吸顶元素的高度算出来）时才调用本函数。
 *
 * @returns `{ safeTop }`，`safeTop` 是模块级单例 ref，任何组件拿到的都是同一份
 * @example
 * const { safeTop } = useSafeArea();
 * const top = computed(() => `${safeTop.value + 48}px`);
 */
export function useSafeArea(): { safeTop: Ref<number> } {
  return { safeTop };
}
