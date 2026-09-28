import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { freshnessOf } from '@/domain/freshness';
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

  function due() {
    const today = todayStr();
    return items.active
      .map((i) => ({ item: i, f: freshnessOf(i, today, settings.settings) }))
      .filter((x) => x.f.state === 'urgent' || x.f.state === 'over');
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
