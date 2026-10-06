import { describe, expect, it } from 'vitest';
import { backupAdvice } from '../backup';

const DAY = 86_400_000;

describe('backupAdvice', () => {
  const created = 1_000_000_000_000;
  const now = created + 40 * DAY;

  it('首次提醒阈值内不打扰（默认 7 天）', () => {
    expect(backupAdvice(null, created, created + 3 * DAY).level).toBe('none');
  });

  it('从未备份且超过 7 天 → info', () => {
    const a = backupAdvice(null, created, now);
    expect(a.level).toBe('info');
    expect(a.days).toBe(40);
  });

  it('超过 90 天 → warn', () => {
    expect(backupAdvice(null, created, created + 100 * DAY).level).toBe('warn');
  });

  it('刚备份过 → none', () => {
    expect(backupAdvice(now - 2 * DAY, created, now).level).toBe('none');
  });

  it('时间戳异常（未来）时不提醒，避免出现负数天数', () => {
    expect(backupAdvice(now + 10 * DAY, created, now).level).toBe('none');
  });

  it('以「上次备份」而非「创建时间」为基准', () => {
    const last = created + 10 * DAY;
    const t = created + 50 * DAY;
    // 距创建 50 天、距上次备份 40 天 —— 取后者
    expect(backupAdvice(last, created, t).days).toBe(40);
  });

  it('备份过走 remindEveryDays(30)，与首次阈值 firstAfterDays(7) 分开', () => {
    const last = created + 10 * DAY;
    expect(backupAdvice(last, created, created + 20 * DAY).level).toBe('none'); // 10 天 < 30
    expect(backupAdvice(last, created, created + 45 * DAY).level).toBe('info'); // 35 天 ≥ 30
  });
});

