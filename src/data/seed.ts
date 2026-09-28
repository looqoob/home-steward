import type { Location } from '@/domain/types';
import type { DataSources } from './repository';
import { newId } from '@/domain/ids';

export const PRESET_LOCATIONS: Array<Pick<Location, 'name' | 'icon' | 'env'>> = [
  { name: '冰箱冷藏', icon: '冷', env: 'chilled' },
  { name: '冰箱冷冻', icon: '冻', env: 'frozen' },
  { name: '常温储物', icon: '储', env: 'cool' },
  { name: '米面柜', icon: '米', env: 'dry' },
  { name: '蔬果篮', icon: '篮', env: 'ventilated' },
  { name: '阳台挂篮', icon: '阳', env: 'ventilated' },
];

/** 首次启动写入预设位置（已存在则不动） */
export async function ensureSeed(db: DataSources): Promise<void> {
  const existing = await db.locations.all();
  if (existing.length > 0) return;
  const now = Date.now();
  const rows: Location[] = PRESET_LOCATIONS.map((p, i) => ({
    id: newId(),
    name: p.name,
    icon: p.icon,
    env: p.env,
    sort: (i + 1) * 10,
    enabled: true,
    builtin: true,
    createdAt: now + i,
    updatedAt: now + i,
    deletedAt: null,
  }));
  await db.locations.bulkPut(rows);
}
