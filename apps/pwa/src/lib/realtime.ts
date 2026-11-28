// SPDX-License-Identifier: MIT
// Copyright 2026 Roland Dreier <roland@rolandd.dev>

import type { RealtimeStatus, ServiceAlert } from '@packages/types/schema';
import { assert } from 'typia';
import { getTransitDateStr } from './time';

const MODIFIED_SCHEDULE_PREFIX_RE = /^M(?=\d)/;

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

/**
 * Determine if real-time data is applicable for the currently selected schedule date.
 * Real-time feeds reflect live operations today and must never be applied to past or future dates.
 */
export function isRealtimeApplicable<T extends RealtimeStatus>(
  dateStr: string | null | undefined,
  realtime: T | null | undefined,
  todayStr: string = getTransitDateStr(),
): realtime is T {
  if (!dateStr || !realtime) return false;
  return dateStr === todayStr;
}

/**
 * Strip the leading "M" prefix that Caltrain adds to train numbers on Modified
 * Weekday schedules (e.g. day after Thanksgiving, Christmas Eve: "M162" -> "162").
 *
 * Caltrain's static GTFS prefixes these trip IDs with "M", whereas 511.org's
 * GTFS-RT feeds and historical performance profiles report the underlying numeric
 * train number. Returns `undefined` if `trainNum` has no modified-schedule prefix.
 */
export function getUnprefixedTrainNumber(trainNum: string): string | undefined {
  if (!MODIFIED_SCHEDULE_PREFIX_RE.test(trainNum)) return undefined;
  return trainNum.slice(1);
}

/**
 * Look up an entry in a train-keyed map (e.g. `realtime.byTrip` or
 * `performance.trips`) by train number. Tries an exact match first; if that
 * misses for a modified-schedule train (e.g. "M162"), retries without the
 * leading "M" ("162").
 */
export function lookupByTrainNumber<T>(
  record: Record<string, T> | null | undefined,
  trainNum: string,
): T | undefined {
  if (!record) return undefined;
  if (Object.hasOwn(record, trainNum) && record[trainNum] !== undefined) {
    return record[trainNum];
  }
  const fallback = getUnprefixedTrainNumber(trainNum);
  if (fallback !== undefined && Object.hasOwn(record, fallback) && record[fallback] !== undefined) {
    return record[fallback];
  }
  return undefined;
}

/**
 * Find the first service alert referencing a train number, trying an exact
 * match first and falling back to the unprefixed train number on modified-
 * schedule days (e.g. "M162" -> "162").
 */
export function findAlertForTrain(
  alerts: readonly ServiceAlert[] | null | undefined,
  trainNum: string,
): ServiceAlert | undefined {
  if (!alerts?.length) return undefined;
  const exact = alerts.find((a) => a.tr?.includes(trainNum));
  if (exact) return exact;
  const fallback = getUnprefixedTrainNumber(trainNum);
  if (fallback !== undefined) {
    return alerts.find((a) => a.tr?.includes(fallback));
  }
  return undefined;
}
