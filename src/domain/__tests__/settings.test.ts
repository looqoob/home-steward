import { describe, expect, it } from 'vitest';
import { normalizeSettings } from '../settings';
import { DEFAULT_SETTINGS } from '../types';

const NOW = Date.UTC(2026, 9, 5);

describe('normalizeSettings', () => {
  it('空值 / 非对象 → 全默认值', () => {
    const s = normalizeSettings(undefined, NOW);
    expect(s).toMatchObject({ ...DEFAULT_SETTINGS, createdAt: NOW, updatedAt: NOW });
    expect(normalizeSettings(null, NOW).soonDays).toBe(DEFAULT_SETTINGS.soonDays);
    expect(normalizeSettings('oops', NOW).themeMode).toBe(DEFAULT_SETTINGS.themeMode);
  });

  it('★ id 恒为 singleton —— 导入 id 非法的设置不会写成永远读不到的垃圾行', () => {
    expect(normalizeSettings({ id: 'not-singleton' }, NOW).id).toBe('singleton');
  });

  it('★ remindEnabled 用 typeof 判定：字符串 "false" 是真值，不能当关闭', () => {
    expect(normalizeSettings({ remindEnabled: 'false' }, NOW).remindEnabled).toBe(true);
    expect(normalizeSettings({ remindEnabled: false }, NOW).remindEnabled).toBe(false);
    expect(normalizeSettings({ remindEnabled: 0 }, NOW).remindEnabled).toBe(true);
  });

  it('★ 时间戳：非有限正数 → null（否则「上次备份」会显示 NaN 天前）', () => {
    expect(normalizeSettings({ lastBackupAt: 'abc' }, NOW).lastBackupAt).toBeNull();
    expect(normalizeSettings({ lastBackupAt: 0 }, NOW).lastBackupAt).toBeNull();
    expect(normalizeSettings({ lastBackupAt: NaN }, NOW).lastBackupAt).toBeNull();
    expect(normalizeSettings({ lastBackupAt: 123 }, NOW).lastBackupAt).toBe(123);
    expect(normalizeSettings({ lastRemindAt: -5 }, NOW).lastRemindAt).toBeNull();
  });

  it('数值越界回落默认；urgentDays 上界跟随 soonDays', () => {
    expect(normalizeSettings({ soonDays: 999 }, NOW).soonDays).toBe(DEFAULT_SETTINGS.soonDays);
    expect(normalizeSettings({ soonDays: 30, urgentDays: 40 }, NOW).urgentDays).toBe(
      DEFAULT_SETTINGS.urgentDays,
    );
    expect(normalizeSettings({ soonDays: 30, urgentDays: 7 }, NOW).urgentDays).toBe(7);
    expect(normalizeSettings({ remindHour: 24 }, NOW).remindHour).toBe(DEFAULT_SETTINGS.remindHour);
    expect(normalizeSettings({ remindMinute: -1 }, NOW).remindMinute).toBe(DEFAULT_SETTINGS.remindMinute);
  });

  it('枚举与主题色：非法回落默认', () => {
    const s = normalizeSettings({ themeMode: 'blue', stockViewMode: 'canvas', accent: '#zzz' }, NOW);
    expect(s.themeMode).toBe('system');
    expect(s.stockViewMode).toBe('group');
    expect(s.accent).toBe(DEFAULT_SETTINGS.accent);
  });

  it('缺 createdAt / updatedAt 时补 now；updatedAt 缺省跟 createdAt', () => {
    const s = normalizeSettings({ createdAt: 111 }, NOW);
    expect(s.createdAt).toBe(111);
    expect(s.updatedAt).toBe(111);
    expect(normalizeSettings({}, NOW).createdAt).toBe(NOW);
  });

  it('合法值原样保留（不误伤正常用户）', () => {
    const s = normalizeSettings(
      {
        remindEnabled: false,
        remindHour: 20,
        remindMinute: 30,
        soonDays: 7,
        urgentDays: 2,
        themeMode: 'dark',
        accent: '#112233',
        stockViewMode: 'timeline',
        createdAt: 1000,
        updatedAt: 2000,
      },
      NOW,
    );
    expect(s).toMatchObject({
      remindEnabled: false,
      remindHour: 20,
      remindMinute: 30,
      soonDays: 7,
      urgentDays: 2,
      themeMode: 'dark',
      accent: '#112233',
      stockViewMode: 'timeline',
      createdAt: 1000,
      updatedAt: 2000,
    });
  });
});
