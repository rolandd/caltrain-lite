// SPDX-License-Identifier: MIT
// Copyright 2026 Roland Dreier <roland@rolandd.dev>

import {
  getCachedSchedule,
  cacheSchedule,
  cacheMeta,
  getCachedPerformance,
  cachePerformance,
  db,
} from './db';
import type { StaticSchedule, ScheduleMeta, TrainPerformanceProfile } from '@packages/types/schema';
import { assert } from 'typia';

/**
 * Initialize the schedule data.
 *
 * Strategy: Stale-While-Revalidate
 * 1. Try to load from IndexedDB.
 * 2. If present, return it immediately (UI loads instantly).
 * 3. In the background, check /api/meta for updates.
 * 4. If absent (first load), fetch /api/schedule and return it.
 *
 * @param onUpdate Optional callback invoked if a new schedule is found/downloaded in the background.
 */
export async function initSchedule(
  onUpdate?: (schedule: StaticSchedule) => void,
): Promise<StaticSchedule> {
  // 1. Try to load from DB
  let cached;
  try {
    cached = await getCachedSchedule();
  } catch (err) {
    console.error('Failed to read schedule from DB:', err);
    // Continue to network fetch
  }

  if (cached) {
    const currentCached = cached;

    // A. Kick off background update check
    checkForUpdate(currentCached.version, currentCached.schemaVersion, onUpdate).catch((err) =>
      console.warn('Background update check failed:', err),
    );

    // B. Background validation to avoid blocking first paint
    setTimeout(async () => {
      try {
        assert<StaticSchedule>(currentCached.data);
      } catch (err) {
        console.error('Cached schedule data validation failed:', err);
        try {
          await db.schedules.clear();
          const fresh = await fetchSchedule();
          await cacheSchedule(fresh);
          if (onUpdate) onUpdate(fresh);
        } catch (recoverErr) {
          console.error('Failed to recover from corrupt cache:', recoverErr);
        }
      }
    }, 0);

    return currentCached.data;
  }

  // 2. No cache? Fetch full bundle immediately
  const schedule = await fetchSchedule();
  await cacheSchedule(schedule);
  return schedule;
}

/**
 * Initialize on-time performance profile data.
 */
export async function initPerformance(
  onUpdate?: (performance: TrainPerformanceProfile) => void,
): Promise<TrainPerformanceProfile | null> {
  try {
    const cached = await getCachedPerformance();
    if (cached) {
      fetchPerformance()
        .then((fresh) => {
          if (fresh.meta.generatedAt !== cached.meta.generatedAt) {
            cachePerformance(fresh);
            if (onUpdate) onUpdate(fresh);
          }
        })
        .catch(() => {});
      return cached;
    }
    const fresh = await fetchPerformance();
    await cachePerformance(fresh);
    return fresh;
  } catch (err) {
    console.warn('Failed to load performance data:', err);
    return null;
  }
}

/**
 * Background update check.
 */
async function checkForUpdate(
  currentVersion: string,
  currentSchemaVersion: number,
  onUpdate?: (schedule: StaticSchedule) => void,
) {
  const res = await fetch('/api/meta');
  if (!res.ok) throw new Error(`Meta fetch failed: ${res.status}`);

  const meta: ScheduleMeta = assert<ScheduleMeta>(await res.json());

  await cacheMeta(meta);

  if (meta.v !== currentVersion || meta.sv !== currentSchemaVersion) {
    const schedule = await fetchSchedule();
    await cacheSchedule(schedule);
    if (onUpdate) onUpdate(schedule);
  }
}

async function fetchSchedule(): Promise<StaticSchedule> {
  const res = await fetch('/api/schedule');
  if (!res.ok) throw new Error(`Schedule fetch failed: ${res.status}`);
  return assert<StaticSchedule>(await res.json());
}

async function fetchPerformance(): Promise<TrainPerformanceProfile> {
  const res = await fetch('/api/performance');
  if (!res.ok) throw new Error(`Performance fetch failed: ${res.status}`);
  return assert<TrainPerformanceProfile>(await res.json());
}
