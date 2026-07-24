// SPDX-License-Identifier: MIT
// Copyright 2026 Roland Dreier <roland@rolandd.dev>

import Dexie, { type EntityTable } from 'dexie';
import type { StaticSchedule, ScheduleMeta, TrainPerformanceProfile } from '@packages/types/schema';

/**
 * Cached schedule stored in IndexedDB.
 */
export interface CachedSchedule {
  /** Version hash (primary key). Matches `StaticSchedule.m.v`. */
  version: string;
  /** Schema version. Matches `StaticSchedule.m.sv`. */
  schemaVersion: number;
  /** The full schedule bundle. */
  data: StaticSchedule;
  /** When this cache entry was written (epoch ms). */
  cachedAt: number;
}

/**
 * Cached schedule metadata for quick version checks.
 */
export interface CachedMeta {
  key: string;
  meta: ScheduleMeta;
  checkedAt: number;
}

/**
 * Cached train performance profile for delay/ETA estimation.
 */
export interface CachedPerformance {
  key: string;
  data: TrainPerformanceProfile;
  cachedAt: number;
}

class TransitDatabase extends Dexie {
  schedules!: EntityTable<CachedSchedule, 'version'>;
  meta!: EntityTable<CachedMeta, 'key'>;
  performance!: EntityTable<CachedPerformance, 'key'>;

  constructor() {
    super('transit-pwa');

    this.version(3).stores({
      schedules: '&version',
      meta: '&key',
      performance: '&key',
    });
  }
}

/** Singleton database instance. */
export const db = new TransitDatabase();

export async function getCachedSchedule(): Promise<CachedSchedule | undefined> {
  return db.schedules.toCollection().first();
}

export async function cacheSchedule(schedule: StaticSchedule): Promise<void> {
  await db.transaction('rw', db.schedules, async () => {
    await db.schedules.clear();
    await db.schedules.put({
      version: schedule.m.v,
      schemaVersion: schedule.m.sv,
      data: schedule,
      cachedAt: Date.now(),
    });
  });
}

export async function cacheMeta(meta: ScheduleMeta): Promise<void> {
  await db.meta.put({
    key: 'current',
    meta,
    checkedAt: Date.now(),
  });
}

export async function getCachedPerformance(): Promise<TrainPerformanceProfile | undefined> {
  const entry = await db.performance.get('current');
  return entry?.data;
}

export async function cachePerformance(data: TrainPerformanceProfile): Promise<void> {
  await db.performance.put({
    key: 'current',
    data,
    cachedAt: Date.now(),
  });
}
