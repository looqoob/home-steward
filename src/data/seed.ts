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

/**
 * 首次启动写入预设位置。
 *
 * ⚠️ 判据是 `countAll() > 0`（**含软删除行**），不是 `all().length > 0`：
 * 用户手动删光六个预设位置后，`all()` 同样返回 0，用它的写法会在下次启动时
 * 把预设重新播一遍 —— 用户删不掉、位置列表还会凭空多出六行。
 */
export async function ensureSeed(db: DataSources): Promise<void> {
  if ((await db.locations.countAll()) > 0) return;
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
