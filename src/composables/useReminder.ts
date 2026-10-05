import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { buildTodayTodo } from '@/domain/todo';
import type { Freshness } from '@/domain/freshness';
import { hashId } from '@/domain/ids';
import { nextDailyAt, todayStr } from '@/domain/dates';
import { useItemsStore } from '@/stores/items';
import { useSettingsStore } from '@/stores/settings';

/**
 * 本地临期提醒。
 * - 原生壳（APK）：为每件临期物品排一条一次性本地通知，真定时、可靠。
 * - PWA：浏览器没有可靠的后台定时器，降级为「每次打开时即时通知 + App 内提醒条」。
 */
export function useReminder() {
  const items = useItemsStore();
  const settings = useSettingsStore();

  /**
   * 需要推送提醒的物资。
   *
   * ⚠️ 直接复用 `domain/todo.buildTodayTodo`，不自己再筛一遍：
   * 待办列表与通知若各筛各的，会出现「待办里没有它、通知却弹出来」，
   * 用户对整个提醒功能就失去信任了（数字口径同理，见 `domain/todo` 顶部注释）。
   */
  function due() {
    return buildTodayTodo(items.list, todayStr(), settings.settings).map((e) => ({
      item: e.item,
      f: { state: e.state, label: e.label, remainDays: e.remainDays, progress: null, sortKey: e.remainDays } as Freshness,
    }));
  }

  async function scheduleNative() {
    if (!settings.settings.remindEnabled) return;
    try {
      const perm = await LocalNotifications.requestPermissions();
      if (perm.display !== 'granted') return;
      const pending = await LocalNotifications.getPending();
      if (pending.notifications.length) {
        await LocalNotifications.cancel({ notifications: pending.notifications.map((n) => ({ id: n.id })) });
      }
      const at = new Date(nextDailyAt(settings.settings.remindHour, settings.settings.remindMinute));
      const list = due();
      if (!list.length) return;
      await LocalNotifications.schedule({
        notifications: list.map(({ item, f }) => ({
          id: hashId(item.id),
          title: `${item.name} 快到期了`,
          body: f.label,
          // 不设 exact，避开 Android 12+ 的 SCHEDULE_EXACT_ALARM 权限
          schedule: { at },
        })),
      });
    } catch {
      /* 权限被拒或插件不可用：静默降级为 App 内提醒条 */
    }
  }

  async function notifyWeb() {
    if (!settings.settings.remindEnabled) return;
    const list = due();
    if (!list.length) return;
    if (!('Notification' in window)) return;
    try {
      if (Notification.permission === 'default') await Notification.requestPermission();
      if (Notification.permission !== 'granted') return;
      new Notification(`今日待吃 ${list.length} 件`, {
        body: list.slice(0, 3).map(({ item, f }) => `${item.name} ${f.label}`).join('、'),
      });
    } catch {
      /* 忽略 */
    }
  }

  async function refresh() {
    if (Capacitor.isNativePlatform()) await scheduleNative();
    else await notifyWeb();
  }

  return { due, refresh, isNative: Capacitor.isNativePlatform() };
}
