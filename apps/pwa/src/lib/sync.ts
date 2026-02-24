// SPDX-License-Identifier: MIT
// Copyright 2026 Roland Dreier <roland@rolandd.dev>

import { getCachedSchedule, cacheSchedule, cacheMeta, db } from './db';
import type { StaticSchedule, ScheduleMeta } from '@packages/types/schema';
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
    // Return immediately to avoid blocking first paint,
    // but validate and check for updates in the background.

    // A. Kick off background update check
    checkForUpdate(currentCached.version, currentCached.schemaVersion, onUpdate).catch((err) =>
      console.warn('Background update check failed:', err),
    );

    // B. Background validation to avoid blocking first paint (typia.assert can be expensive)
    setTimeout(async () => {
      try {
        assert<StaticSchedule>(currentCached.data);
      } catch (err) {
        console.error('Cached schedule data validation failed:', err);
        try {
          // If validation failed, clear the corrupt cache and fetch fresh
          await db.schedules.clear();
          console.log('Cleared corrupt schedule cache');
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
  console.log('No local schedule, fetching full bundle...');
  const schedule = await fetchSchedule();
  await cacheSchedule(schedule);
  return schedule;
}

/**
 * Background update check.
 * Use /api/meta to avoid downloading the full bundle if not needed.
 */
async function checkForUpdate(
  currentVersion: string,
  currentSchemaVersion: number,
  onUpdate?: (schedule: StaticSchedule) => void,
) {
  const res = await fetch('/api/meta');
  if (!res.ok) throw new Error(`Meta fetch failed: ${res.status}`);

  const meta: ScheduleMeta = assert<ScheduleMeta>(await res.json());

  // Update metadata cache for UI/debug
  await cacheMeta(meta);

  if (meta.v !== currentVersion || meta.sv !== currentSchemaVersion) {
    console.log(`New schedule available (v=${meta.v.slice(0, 8)}, sv=${meta.sv}), downloading...`);
    const schedule = await fetchSchedule();
    await cacheSchedule(schedule);
    console.log('Schedule updated in background.');
    if (onUpdate) onUpdate(schedule);
  }
}

async function fetchSchedule(): Promise<StaticSchedule> {
  const res = await fetch('/api/schedule');
  if (!res.ok) throw new Error(`Schedule fetch failed: ${res.status}`);
  return assert<StaticSchedule>(await res.json());
}
