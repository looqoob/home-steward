import type { DataSources } from './repository';
import { createDexieSources } from './dexie/sources';

/**
 * 持久化选型唯一硬编码处。
 * 将来换成 SQLite：实现 createSqliteSources() 后改这一行即可，业务代码不动。
 */
export const db: DataSources = createDexieSources();

export type { DataSources } from './repository';
