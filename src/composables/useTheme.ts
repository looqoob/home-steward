import { readonly, ref } from 'vue';
import { accentScale, DEFAULT_ACCENT, normalizeHex, resolveAccent } from '@/domain/accent';
import type { ThemeMode } from '@/domain/types';

/**
 * 外观主题（深浅模式 + 主题色）的运行时控制器。
 *
 * 设计要点（改之前先读）：
 *
 * 1. **深浅模式由 `html[data-theme]` 驱动**，不是 `@media (prefers-color-scheme)`。
 *    CSS 里只有 `html[data-theme='dark']` 一种深色规则 —— 媒体查询无法被应用内状态覆盖，
 *    用户手选浅色但系统是深色时会失效。`system` 模式在这里被**解析**成 light/dark 后写进 DOM。
 * 2. **主题色由 JS 算好整条色阶后写到 `<html>` 的 inline style**（`--primary-50…700`、`--focus-ring`）。
 *    inline 优先级高于 `:root`，所以能覆盖 CSS 里的默认色板；不用 CSS `color-mix()`
 *    —— 那样做不了「对比度不达标就继续调」的闭环，老 WebView 也未必支持。
 * 3. **localStorage 镜像（`hs.theme`）只服务首屏**：Dexie 是异步的，`index.html` 里的
 *    内联脚本在首帧之前读它并写好 `data-theme`，避免深色用户看到一闪的白屏。
 *    真源始终是 IndexedDB 里的 `settings`，镜像读不到就用默认值，绝不阻塞。
 * 4. `adjusted` 表示用户选的主色被自动微调过 —— UI 要提示，否则用户以为自己选的色没生效。
 *
 * 状态是**模块级单例**（同 `useToast`），任何组件调用 `useTheme()` 拿到的是同一份。
 */

/** 首屏镜像的 key。改这个 key 必须同步改 `index.html` 里的内联脚本 */
const MIRROR_KEY = 'hs.theme';

/** 状态栏/地址栏配色：与 `--bg-card` 一致（顶栏就是卡片色） */
const META_LIGHT = '#ffffff';
const META_DARK = '#1c211f';

const mode = ref<ThemeMode>('system');
const accent = ref<string>(DEFAULT_ACCENT);
const resolved = ref<'light' | 'dark'>('light');
const adjusted = ref(false);

let mq: MediaQueryList | null = null;
let bound = false;

function systemPrefersDark(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function writeMirror() {
  try {
    localStorage.setItem(MIRROR_KEY, JSON.stringify({ mode: mode.value, accent: accent.value }));
  } catch {
    // 隐私模式 / 配额用尽：镜像只是首屏优化，写不进去不影响功能
  }
}

function updateMeta(dark: boolean) {
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', dark ? META_DARK : META_LIGHT);
}

/**
 * 把当前 mode + accent 落到 DOM 上。
 * @param hexOverride 预览用的临时色（取色器拖动中），不写镜像、不改 `accent`
 */
function apply(hexOverride?: string) {
  if (typeof document === 'undefined') return;

  const dark = mode.value === 'dark' || (mode.value === 'system' && systemPrefersDark());
  resolved.value = dark ? 'dark' : 'light';

  const el = document.documentElement;
  el.dataset.theme = dark ? 'dark' : 'light';

  const hex = hexOverride ?? accent.value;
  const scale = accentScale(hex, dark ? 'dark' : 'light');
  for (const [k, v] of Object.entries(scale)) el.style.setProperty(k, v);
  el.style.setProperty('--accent', scale['--primary-600']);

  adjusted.value = resolveAccent(hex, dark ? 'dark' : 'light').adjusted;
  updateMeta(dark);

  if (!hexOverride) writeMirror();
}

/** 监听系统偏好变化（只在 `system` 模式下会改变结果） */
function bindSystem() {
  if (bound || typeof window === 'undefined' || !window.matchMedia) return;
  bound = true;
  mq = window.matchMedia('(prefers-color-scheme: dark)');
  mq.addEventListener('change', () => {
    if (mode.value === 'system') apply();
  });
}

export function useTheme() {
  /**
   * 把设置里的值同步进来（App.vue 用 `watch` 调它，immediate 一次 + 之后每次变更）。
   * 只有真的变了才重新 apply，避免每次 store 更新都重算色阶。
   */
  function sync(m: ThemeMode, a: string) {
    bindSystem();
    const nextAccent = normalizeHex(a) ?? DEFAULT_ACCENT;
    const changed = m !== mode.value || nextAccent !== accent.value;
    mode.value = m;
    accent.value = nextAccent;
    if (changed || document.documentElement.dataset.theme === undefined) apply();
  }

  /** 取色器拖动中的实时预览：只改 DOM，不落库、不写镜像 */
  function preview(hex: string) {
    const h = normalizeHex(hex);
    if (h) apply(h);
  }

  /** 放弃预览、回到已保存的主题色（组件卸载时调用） */
  function refresh() {
    apply();
  }

  return {
    /** 存储中的模式（可能是 `system`） */
    mode: readonly(mode),
    /** 当前生效的主色（已归一化，未校正） */
    accent: readonly(accent),
    /** 解析后的实际模式，给 `van-config-provider :theme` 用（Vant 不认识 `system`） */
    resolved: readonly(resolved),
    /** 用户选的色是否被自动微调过 */
    adjusted: readonly(adjusted),
    sync,
    preview,
    refresh,
  };
}
