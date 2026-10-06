import { describe, expect, it } from 'vitest';
import { buildTodayTodo, isSnoozed, snoozeUntilOf } from '../todo';
import { mkItem, SETTINGS, TODAY, NOW } from './fixtures';

const DAY = 86_400_000;

describe('buildTodayTodo', () => {
  it('只收录已过期与紧急项（≤ urgentDays=3），临期/新鲜一律不入', () => {
    const todo = buildTodayTodo(
      [
        mkItem({ id: 'a', name: '过期三天', expireIn: -3 }),
        mkItem({ id: 'b', name: '今天到期', expireIn: 0 }),
        mkItem({ id: 'c', name: '还剩两天', expireIn: 2 }),
        mkItem({ id: 'd', name: '还剩三天', expireIn: 3 }), // 边界：urgentDays=3，含
        mkItem({ id: 'e', name: '还剩四天', expireIn: 4 }), // 边界外
        mkItem({ id: 'f', name: '临期十天', expireIn: 10 }),
        mkItem({ id: 'g', name: '还很新鲜', expireIn: 60 }),
      ],
      TODAY,
      SETTINGS,
      NOW,
    );
    expect(todo.map((t) => t.item.name)).toEqual(['过期三天', '今天到期', '还剩两天', '还剩三天']);
  });

  it('已过期优先，且过期越久越靠前（remainDays 升序天然实现）', () => {
    const todo = buildTodayTodo(
      [mkItem({ id: 'a', name: '过期一天', expireIn: -1 }), mkItem({ id: 'b', name: '过期十天', expireIn: -10 })],
      TODAY,
      SETTINGS,
      NOW,
    );
    expect(todo.map((t) => t.item.name)).toEqual(['过期十天', '过期一天']);
    expect(todo.map((t) => t.remainDays)).toEqual([-10, -1]);
  });

  it('排除已用完 / 已删除 / 无到期日', () => {
    const todo = buildTodayTodo(
      [
        mkItem({ id: 'a', name: '已用完', expireIn: -5, status: 'finished' }),
        mkItem({ id: 'b', name: '已删除', expireIn: -5, deletedAt: NOW }),
        mkItem({ id: 'c', name: '无到期日', expireIn: null }),
      ],
      TODAY,
      SETTINGS,
      NOW,
    );
    expect(todo).toHaveLength(0);
  });

  it('延后期内不出现；延后到期后重新出现', () => {
    const item = mkItem({ id: 'a', name: '牛奶', expireIn: 0, snoozeUntil: NOW + DAY });
    expect(buildTodayTodo([item], TODAY, SETTINGS, NOW)).toHaveLength(0);

    const expiredSnooze = mkItem({ id: 'b', name: '牛奶', expireIn: 0, snoozeUntil: NOW - 1000 });
    expect(buildTodayTodo([expiredSnooze], TODAY, SETTINGS, NOW)).toHaveLength(1);
  });

  it('延后只影响待办，绝不改到期日', () => {
    const before = mkItem({ id: 'a', name: '牛奶', expireIn: 0 });
    const after = { ...before, snoozeUntil: NOW + DAY };
    expect(before.expireAt).toBe(after.expireAt);
  });
});

describe('isSnoozed / snoozeUntilOf', () => {
  it('未设 snoozeUntil 视为未延后', () => {
    expect(isSnoozed(mkItem({ snoozeUntil: null }), NOW)).toBe(false);
  });

  it('延后未到期为 true，已过期为 false', () => {
    expect(isSnoozed(mkItem({ snoozeUntil: NOW + DAY }), NOW)).toBe(true);
    expect(isSnoozed(mkItem({ snoozeUntil: NOW - 1 }), NOW)).toBe(false);
  });

  it('snoozeUntilOf 返回「明天此刻」', () => {
    expect(snoozeUntilOf(mkItem(), 1, NOW)).toBe(NOW + DAY);
  });
});
