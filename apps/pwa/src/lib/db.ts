import Dexie, { type EntityTable } from 'dexie';
import type { StaticSchedule, ScheduleMeta } from '@packages/types/schema';

/**
 * Cached schedule stored in IndexedDB.
 *
 * There is only ever one row in this table — the current schedule.
 * The `version` field acts as the primary key and is the SHA-256 hash
 * of the source GTFS ZIP, matching `StaticSchedule.m.v`.
 */
export interface CachedSchedule {
  /** Version hash (primary key). Matches `StaticSchedule.m.v`. */
  version: string;
  /** The full schedule bundle. */
  data: StaticSchedule;
  /** When this cache entry was written (epoch ms). */
  cachedAt: number;
}

/**
 * Cached schedule metadata for quick version checks without loading
 * the full schedule bundle.
 */
export interface CachedMeta {
  /** Fixed key — always "current". */
  key: string;
  /** The metadata from the last /api/meta check. */
  meta: ScheduleMeta;
  /** When this was last checked (epoch ms). */
  checkedAt: number;
}

/**
 * Transit PWA IndexedDB database.
 *
 * Uses Dexie for a clean typed API over IndexedDB.
 *
 * Tables:
 * - `schedules`: Cached StaticSchedule bundles (typically 1 row)
 * - `meta`: Cached ScheduleMeta for version checking (1 row)
 */
class TransitDatabase extends Dexie {
  schedules!: EntityTable<CachedSchedule, 'version'>;
  meta!: EntityTable<CachedMeta, 'key'>;

  constructor() {
    super('transit-pwa');

    this.version(1).stores({
      // Only indexed fields are listed; Dexie stores the full object.
      // '&' prefix = unique primary key (inlined key path).
      schedules: '&version',
      meta: '&key',
    });
  }
}

/** Singleton database instance. */
export const db = new TransitDatabase();

/**
 * Get the currently cached schedule, if any.
 */
export async function getCachedSchedule(): Promise<CachedSchedule | undefined> {
  // Return the first (and typically only) schedule
  return db.schedules.toCollection().first();
}

/**
 * Store a schedule bundle in the cache, replacing any previous version.
 */
export async function cacheSchedule(schedule: StaticSchedule): Promise<void> {
  await db.transaction('rw', db.schedules, async () => {
    // Clear old versions
    await db.schedules.clear();
    // Store the new one
    await db.schedules.put({
      version: schedule.m.v,
      data: schedule,
      cachedAt: Date.now(),
    });
  });
}

/**
 * Check if the cached schedule version matches the given version hash.
 */
export async function isCacheCurrentVersion(version: string): Promise<boolean> {
  const cached = await db.schedules.get(version);
  return cached !== undefined;
}

/**
 * Store the latest meta check result.
 */
export async function cacheMeta(meta: ScheduleMeta): Promise<void> {
  await db.meta.put({
    key: 'current',
    meta,
    checkedAt: Date.now(),
  });
}

/**
 * Get the last cached meta, if any.
 */
export async function getCachedMeta(): Promise<CachedMeta | undefined> {
  return db.meta.get('current');
}
