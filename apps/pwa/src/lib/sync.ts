// SPDX-License-Identifier: MIT
// Copyright 2026 Roland Dreier <roland@rolandd.dev>

import { getCachedSchedule, cacheSchedule, cacheMeta } from './db';
import type { StaticSchedule, ScheduleMeta } from '@packages/types/schema';

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
  try {
    const cached = await getCachedSchedule();
    if (cached) {
      // Return immediately, but trigger background update
      checkForUpdate(cached.version, cached.schemaVersion, onUpdate).catch((err) =>
        console.warn('Background update check failed:', err),
      );
      return cached.data;
    }
  } catch (err) {
    console.error('Failed to read from DB:', err);
    // Fallthrough to network fetch
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

  const meta: ScheduleMeta = await res.json();

  // Update metadata cache for UI/debug
  await cacheMeta(meta);

  if (meta.v !== currentVersion || meta.sv !== currentSchemaVersion) {
    console.log(`New schedule available (v=${meta.v.slice(0, 8)}, sv=${meta.sv}), downloading...`);
    const schedule = await fetchSchedule();
    await cacheSchedule(schedule);
    console.log('Schedule updated in background.');
    if (onUpdate) onUpdate(schedule);
  } else {
    // console.log('Schedule is up to date');
  }
}

async function fetchSchedule(): Promise<StaticSchedule> {
  const res = await fetch('/api/schedule');
  if (!res.ok) throw new Error(`Schedule fetch failed: ${res.status}`);
  return res.json();
}
