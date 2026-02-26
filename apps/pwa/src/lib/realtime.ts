// SPDX-License-Identifier: MIT
// Copyright 2026 Roland Dreier <roland@rolandd.dev>

import type { RealtimeStatus } from '@packages/types/schema';
import { assert } from 'typia';

export interface RealtimeStatusWithMetadata extends RealtimeStatus {
  /** Initial age of the feed in milliseconds at the moment it was fetched. */
  initialAge: number;
  /** Local client-side timestamp (ms) when this was received. */
  fetchedAt: number;
}

/**
 * Fetch real-time status from the Worker API.
 *
 * Relies on the browser's HTTP cache to respect the `max-age` (30s)
 * returned by the Worker. The app polls every 60s, so it will always get
 * fresh data, while rapid navigations within 30s will hit the browser cache.
 * We do not manually persist this data to localStorage to avoid showing
 * stale data on app restart.
 */
export async function fetchRealtime(): Promise<RealtimeStatusWithMetadata | null> {
  try {
    const res = await fetch('/api/realtime');
    if (!res.ok) {
      if (res.status === 404) return null; // No data yet (e.g. night)
      throw new Error(`RT API error: ${res.status}`);
    }

    const serverDateHeader = res.headers.get('Date');
    const serverTime = serverDateHeader ? new Date(serverDateHeader).getTime() : Date.now();
    const data = assert<RealtimeStatus>(await res.json());

    // Calculate how old the feed was when the server sent it.
    // data.t is in epoch seconds, serverTime is in epoch ms.
    const initialAge = Math.max(0, serverTime - data.t * 1000);

    return { ...data, initialAge, fetchedAt: Date.now() };
  } catch (err) {
    console.warn('Failed to fetch realtime data:', err);
    return null;
  }
}
