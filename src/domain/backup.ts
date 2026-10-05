/**
 * 备份提醒的计算逻辑（纯函数，无 IO）。
 *
 * 背景：数据 100% 存在本机 IndexedDB，清缓存 / 换设备即全部丢失且不可恢复。
 * `Settings.lastBackupAt` 这个字段从 v0.1 就存在，但一直没有人写入、也没有人读取，
 * 等于白留。本模块把它接上，并统一「该不该提醒、提醒什么措辞」的判断。
 */

export type BackupLevel = 'none' | 'info' | 'warn';

export interface BackupAdvice {
  level: BackupLevel;
  /** 距上次备份的天数；未到提醒门槛时为 0 */
  days: number;
  /** 可直接展示的提示文案；`level === 'none'` 时为空串 */
  text: string;
}

export interface BackupAdviceOptions {
  /**
   * 从未导出过：安装满多少天才开始提醒。
   * 给新手期一个宽限，否则刚装 app 第二天就看到"未备份"很莫名其妙。
   */
  firstAfterDays?: number;
  /** 导出过：超过多少天开始提醒 */
  remindEveryDays?: number;
  /** 超过多少天升级为橙色警告 */
  warnAfterDays?: number;
}

const DAY = 24 * 60 * 60 * 1000;

const DEFAULTS: Required<BackupAdviceOptions> = {
  firstAfterDays: 7,
  remindEveryDays: 30,
  warnAfterDays: 90,
};

/**
 * 计算备份提醒建议。
 *
 * @param lastBackupAt 上次导出成功的时刻；`null` 表示从未导出过
 * @param createdAt 设置创建时间，作为「从未导出过」时的计时起点
 * @param now 当前时刻，便于测试
 * @returns `level: 'none'` 表示不该打扰用户
 * @example
 * backupAdvice(null, Date.now() - 40 * 86400000)
 * // → { level: 'info', days: 40, text: '已 40 天未备份数据' }
 */
export function backupAdvice(
  lastBackupAt: number | null,
  createdAt: number,
  now: number = Date.now(),
  opts: BackupAdviceOptions = {},
): BackupAdvice {
  const o = { ...DEFAULTS, ...opts };
  const from = lastBackupAt ?? createdAt;
  // 设置刚创建、或时间戳异常（负数/未来）时不提醒，避免出现「已 -3 天未备份」
  const days = Math.floor((now - from) / DAY);
  if (!Number.isFinite(days) || days < o.firstAfterDays) {
    return { level: 'none', days: 0, text: '' };
  }
  const level: BackupLevel = days >= o.warnAfterDays ? 'warn' : 'info';
  return { level, days, text: `已 ${days} 天未备份数据` };
}
