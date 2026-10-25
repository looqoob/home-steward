import { describe, expect, it } from 'vitest';
import { manualDaysForExpiry } from '../shelfLife';


describe('manualDaysForExpiry · 指定到期日 → 手填天数（v1.1 F17）', () => {
  it('★ 基准是 storedAt：今天入库选 5 天后到期 → 5', () => {
    expect(manualDaysForExpiry('2026-10-30', '2026-10-25')).toBe(5);
  });
  it('有生产日时基准改为 producedAt（computeExpiry 同口径）', () => {
    expect(manualDaysForExpiry('2026-11-04', '2026-10-25', '2026-10-30')).toBe(5);
  });
  it('早于基准的日期返回 null（手填天数必须 > 0，UI 的日期 min 挡住该入口）', () => {
    expect(manualDaysForExpiry('2026-10-24', '2026-10-25')).toBeNull();
    expect(manualDaysForExpiry('2026-10-25', '2026-10-25')).toBeNull();
  });
});
