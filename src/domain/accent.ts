/**
 * 主题色计算 —— 纯函数，零依赖（不 import Vue / Pinia / data 层）。
 *
 * 为什么单独一个文件：主题色不是「存一个 hex 就完事」。用户可能选到荧光黄、近白或近黑，
 * 直接拿去当按钮底色会让白字读不出来。这里负责把任意 hex 校正成**可用**的主色，
 * 再派生出一套对比度达标的色阶（50/100/500/600/700 + 焦点环）。
 *
 * 所有函数都是同步纯函数，可以在 Node 里直接单测，不需要浏览器环境。
 *
 * ⚠️ 语义色（环境色 ENV_MAP、新鲜度四态 fresh/soon/urgent/over）**不参与主题色计算**：
 * 「冷藏=蓝、临期=橙、过期=灰」是用户已经建立的语义，跟着品牌色变会失去辨识度。
 */

import { DEFAULT_SETTINGS, type ThemeMode } from './types';

/** 默认主题色：与 `DEFAULT_SETTINGS.accent` 同源，别在别处再写一份 */
export const DEFAULT_ACCENT = DEFAULT_SETTINGS.accent;

/** 主题模式的三档选项（顺序即 UI 展示顺序） */
export const THEME_MODES: Array<{ value: ThemeMode; label: string }> = [
  { value: 'system', label: '跟随系统' },
  { value: 'light', label: '浅色' },
  { value: 'dark', label: '深色' },
];

/** 预设主题色。每个都已在深浅两套下做过对比度自测（见 `contrastRatio`） */
export interface AccentPreset {
  id: string;
  name: string;
  hex: string;
}

export const ACCENT_PRESETS: AccentPreset[] = [
  { id: 'green', name: '青竹绿', hex: '#228055' },
  { id: 'teal', name: '湖水青', hex: '#0f7b8a' },
  { id: 'blue', name: '晴空蓝', hex: '#2563a8' },
  { id: 'violet', name: '紫藤', hex: '#6b4fae' },
  { id: 'amber', name: '琥珀橙', hex: '#c2681f' },
  { id: 'wine', name: '酒红', hex: '#9c3b3b' },
];

/* ------------------------------------------------------------------ */
/* 颜色工具                                                             */
/* ------------------------------------------------------------------ */

type Rgb = [number, number, number];

const WHITE_HEX = '#ffffff';
const BLACK_HEX = '#000000';
/** 浅色模式的页面底色（`--bg-page`），深色模式的卡片底色（`--bg-card`）——主色要能从底色里「浮」出来 */
const SURFACE_LIGHT = '#f6f7f6';
const SURFACE_DARK = '#1c211f';

/**
 * 归一化用户输入的 hex：`#abc` → `#aabbcc`、大小写统一、非法返回 `null`。
 * 自定义取色器在个别 WebView 上可能给出 `rgb(...)` 或带空格的值，一律交给这里兜底。
 */
export function normalizeHex(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  let s = input.trim().replace(/^#/, '');
  if (/^[0-9a-fA-F]{3}$/.test(s)) s = s.split('').map((c) => c + c).join('');
  if (!/^[0-9a-fA-F]{6}$/.test(s)) return null;
  return `#${s.toLowerCase()}`;
}

function hexToRgb(hex: string): Rgb {
  const s = normalizeHex(hex) ?? DEFAULT_ACCENT;
  const n = parseInt(s.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex([r, g, b]: Rgb): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** sRGB 通道 → 线性光（0–1） */
function toLinear(c: number): number {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

/** 线性光（0–1）→ sRGB 通道 */
function toSrgb(v: number): number {
  const c = v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
  return c * 255;
}

/**
 * 在**线性光**空间混合两色，避免 sRGB 直接插值产生的发灰/发脏。
 * @param tA a 的权重（0–1），b 占 `1 - tA`
 */
function mixLinear(a: Rgb, b: Rgb, tA: number): Rgb {
  const t = Math.max(0, Math.min(1, tA));
  const out: Rgb = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    out[i] = toSrgb(toLinear(a[i]) * t + toLinear(b[i]) * (1 - t));
  }
  return out;
}

/** 相对亮度（WCAG 2.1 定义，0–1） */
function luminance(rgb: Rgb): number {
  const [r, g, b] = rgb.map(toLinear) as Rgb;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * 两色的 WCAG 对比度（1–21）。
 * `>= 4.5` 满足正文 AA，`>= 3` 满足大字号与非文本元素（图标、边框、焦点环）。
 */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(hexToRgb(a));
  const lb = luminance(hexToRgb(b));
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

/* ------------------------------------------------------------------ */
/* 主色校正                                                             */
/* ------------------------------------------------------------------ */

export interface ResolvedAccent {
  /** 校正后的主色（可以直接当按钮底色用） */
  hex: string;
  /** 是否被自动调整过 —— UI 要据此提示「已自动微调以保证可读性」 */
  adjusted: boolean;
}

/**
 * 把任意 hex 校正成可用主色。
 *
 * 两条硬约束（顺序即优先级）：
 * 1. **白字在主色上 ≥ 4.5:1** —— 主色是按钮底色，按钮文字是白色，这条不满足就是不可读；
 * 2. **主色与所在模式的底色 ≥ 3:1** —— 浅色模式下太浅、深色模式下太暗，按钮会「陷进」背景。
 *
 * 两条冲突时（例如深色模式下选了个又暗又灰的色）**文字对比度优先**。
 */
export function resolveAccent(hex: string, mode: 'light' | 'dark'): ResolvedAccent {
  const base = normalizeHex(hex) ?? DEFAULT_ACCENT;
  const original = rgbToHex(hexToRgb(base));
  const surface = mode === 'dark' ? SURFACE_DARK : SURFACE_LIGHT;

  let cur = hexToRgb(base);
  for (let i = 0; i < 60; i++) {
    const textOk = contrastRatio(rgbToHex(cur), WHITE_HEX) >= 4.5;
    const surfaceOk = contrastRatio(rgbToHex(cur), surface) >= 3;
    if (textOk && surfaceOk) break;
    // 文字对比度不达标 → 一律压暗；否则按模式提亮（深色底）或压暗（浅色底）来拉开与底色的差距
    const toward = !textOk || mode === 'light' ? hexToRgb(BLACK_HEX) : hexToRgb(WHITE_HEX);
    cur = mixLinear(cur, toward, 0.96);
  }

  const out = rgbToHex(cur);
  return { hex: out, adjusted: out !== original };
}

/* ------------------------------------------------------------------ */
/* 色阶派生                                                             */
/* ------------------------------------------------------------------ */

/**
 * 一套主色派生的 CSS 变量。键名即 `src/styles/index.css` 里的设计 token，
 * 由 `useTheme` 写到 `<html>` 的 inline style 上（inline 优先级高于 `:root`，覆盖默认值）。
 */
export type AccentScale = Record<
  '--primary-50' | '--primary-100' | '--primary-500' | '--primary-600' | '--primary-700' | '--focus-ring',
  string
>;

/**
 * 由主色派生整套色阶。
 *
 * 不走 CSS `color-mix()`：那样虽然省事，但没法做「不达标就继续调」的闭环，
 * 而且老 WebView（Capacitor 壳）不一定支持。JS 里算完直接写变量，最稳。
 *
 * | token | 用途 | 约束 |
 * | --- | --- | --- |
 * | `--primary-600` | 按钮底色 + 白字 | 与白 ≥4.5、与底色 ≥3 |
 * | `--primary-500` | hover / 亮态 | 比 600 稍亮 |
 * | `--primary-700` | 浅底上的强调文字、选中态文字 | 与 `--primary-50` ≥4.5、与卡片底 ≥3 |
 * | `--primary-100` | 选中态浅底 | — |
 * | `--primary-50` | 徽章/标签底色 | 与 `--primary-700` ≥4.5 |
 * | `--focus-ring` | 焦点环 | 与卡片底 ≥3（WCAG 2.4.11 非文本对比） |
 */
export function accentScale(hex: string, mode: 'light' | 'dark'): AccentScale {
  const base = hexToRgb(resolveAccent(hex, mode).hex);
  const card = hexToRgb(mode === 'dark' ? SURFACE_DARK : WHITE_HEX);
  const isDark = mode === 'dark';

  // 深色模式的「浅底」是往卡片底色里掺主色，而不是往白里掺 —— 否则会出现一块刺眼的白
  const surfaceTint = isDark ? SURFACE_DARK : WHITE_HEX;
  const p50 = mixLinear(base, hexToRgb(surfaceTint), isDark ? 0.16 : 0.12);
  const p100 = mixLinear(base, hexToRgb(surfaceTint), isDark ? 0.26 : 0.22);
  const p500 = mixLinear(base, hexToRgb(WHITE_HEX), 0.86);
  const p600 = base;
  // 浅色模式 700 要更深（深底上的字才清楚的反面）；深色模式 700 要更亮（深底上的强调字必须提亮）
  let p700 = isDark ? mixLinear(base, hexToRgb(WHITE_HEX), 0.55) : mixLinear(base, hexToRgb(BLACK_HEX), 0.72);

  // 徽章文字（700）压在徽章底（50）上必须 ≥4.5
  for (let i = 0; i < 20 && contrastRatio(rgbToHex(p700), rgbToHex(p50)) < 4.5; i++) {
    p700 = mixLinear(p700, isDark ? hexToRgb(WHITE_HEX) : hexToRgb(BLACK_HEX), 0.95);
  }

  let ring = p700;
  // 焦点环是图形元素，与卡片底 ≥3 即可（WCAG 2.4.11）
  for (let i = 0; i < 20 && contrastRatio(rgbToHex(ring), rgbToHex(card)) < 3; i++) {
    ring = mixLinear(ring, isDark ? hexToRgb(WHITE_HEX) : hexToRgb(BLACK_HEX), 0.95);
  }

  return {
    '--primary-50': rgbToHex(p50),
    '--primary-100': rgbToHex(p100),
    '--primary-500': rgbToHex(p500),
    '--primary-600': rgbToHex(p600),
    '--primary-700': rgbToHex(p700),
    '--focus-ring': rgbToHex(ring),
  };
}
