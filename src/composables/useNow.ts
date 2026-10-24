import { computed, ref } from 'vue';
import { todayStr } from '@/domain/dates';

/**
 * 跨零点会失效的 `const today = todayStr()` 的替代（REV-28）。
 *
 * ## 背景
 *
 * PWA 会被**挂在后台一整天**：早上打开、中午切走、第二天凌晨再切回来。
 * `todayStr()` 在 setup 里只取一次，之后「剩余天数 / 今日待办 / 统计」整天停在昨天，
 * 只有手动刷新才恢复 —— 对一个「告诉你今天该吃什么」的 App 是致命的。
 *
 * ## 实现
 *
 * 模块级单例：一个 60s 的 `setInterval` + 一个 `visibilitychange` 监听，
 * 所有组件共享同一份 `now`。首次调用时才启动（node 测试环境不 import 本模块，
 * 但仍以防万一地守了 `typeof document`）。
 *
 * `visibilitychange` 是关键：后台标签的定时器被节流到分钟级甚至挂起，
 * 切回前台的那一刻必须立即取一次新值，否则用户看到的第一屏仍是旧数据。
 */

const now = ref(Date.now());
let started = false;

function start() {
  if (started || typeof document === 'undefined') return;
  started = true;
  setInterval(() => {
    now.value = Date.now();
  }, 60_000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') now.value = Date.now();
  });
}

/** 响应式的当前时刻（60s 一跳 + 切回前台即刷新）。组件里用它派生日期，别再 `Date.now()` 定格。 */
export function useNow() {
  start();
  return now;
}

/** 响应式的「今天」：`computed(() => todayStr(now.value))` 的便捷封装。 */
export function useToday() {
  start();
  return computed(() => todayStr(now.value));
}
