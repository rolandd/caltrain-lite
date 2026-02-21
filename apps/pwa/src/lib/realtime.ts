// SPDX-License-Identifier: MIT
// Copyright 2026 Roland Dreier <roland@rolandd.dev>

import type { RealtimeStatus } from '@packages/types/schema';
import { assert } from 'typia';

/**
 * Fetch real-time status from the Worker API.
 *
 * Relies on the browser's HTTP cache to respect the `max-age` (180s)
 * returned by the Worker. We do not manually persist this data
 * to localStorage to avoid showing stale data on app restart.
 */
export async function fetchRealtime(): Promise<RealtimeStatus | null> {
  try {
    const res = await fetch('/api/realtime');
    if (!res.ok) {
      if (res.status === 404) return null; // No data yet (e.g. night)
      throw new Error(`RT API error: ${res.status}`);
    }
    return assert<RealtimeStatus>(await res.json());
  } catch (err) {
    console.warn('Failed to fetch realtime data:', err);
    return null;
  }
}
