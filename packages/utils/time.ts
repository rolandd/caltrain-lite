// SPDX-License-Identifier: MIT
// Copyright 2026 Roland Dreier <roland@rolandd.dev>

export const TRANSIT_TIMEZONE = 'America/Los_Angeles';

/**
 * Caltrain transit operational day cutoff hour (3:00 AM).
 * Late-night trains operating past midnight (up to ~01:30 AM) belong to the previous day's
 * GTFS service schedule. Rolling over at 3:00 AM aligns the active service day with the
 * natural overnight service gap (01:30 AM - 04:30 AM).
 */
export const TRANSIT_DAY_CUTOFF_HOURS = 3;

const transitDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: TRANSIT_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const transitHourFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: TRANSIT_TIMEZONE,
  hour: 'numeric',
  hour12: false,
});

const wallClockFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: TRANSIT_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

/**
 * Format a Date or epoch millisecond timestamp as YYYY-MM-DD in the transit timezone.
 */
export function formatTransitCalendarDate(date: Date | number): string {
  return transitDateFormatter.format(date);
}

/**
 * Shift a YYYY-MM-DD date string by a whole number of calendar days.
 */
export function addLocalDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d! + days)).toISOString().slice(0, 10);
}

/**
 * Return today's service date string in the local transit timezone (YYYY-MM-DD),
 * rolling over at `cutoffHours` (default 3:00 AM).
 */
export function getTransitDateStr(
  date: Date = new Date(),
  cutoffHours: number = TRANSIT_DAY_CUTOFF_HOURS,
): string {
  const dateStr = transitDateFormatter.format(date);
  const hourPart = transitHourFormatter.formatToParts(date).find((p) => p.type === 'hour');
  let hour = parseInt(hourPart?.value || '0', 10);
  if (hour === 24) hour = 0;

  if (hour < cutoffHours) {
    return addLocalDays(dateStr, -1);
  }
  return dateStr;
}

/**
 * Zone offset (local wall clock minus UTC) in seconds in effect at the given
 * UTC epoch second. In Los Angeles this is -8h (PST) or -7h (PDT).
 */
function zoneOffsetSec(epochSec: number): number {
  const parts = wallClockFormatter.formatToParts(new Date(epochSec * 1000));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const wallAsUtcSec =
    Date.UTC(
      get('year'),
      get('month') - 1,
      get('day'),
      get('hour') % 24,
      get('minute'),
      get('second'),
    ) / 1000;
  return wallAsUtcSec - epochSec;
}

/**
 * Zone profile of a single calendar day in the transit timezone.
 *
 * A day has at most one DST transition, so the offset in effect at any wall
 * time within the day is fully determined by midnight's offset plus, on the
 * two transition days per year, the instant at which it flips.
 */
interface DayZoneInfo {
  /** UTC epoch second of local midnight. */
  midnightUtcSec: number;
  /** Zone offset (wall clock - UTC) in seconds in effect at midnight. */
  offsetSec: number;
  /** First instant (UTC epoch second) whose offset differs, if any. */
  transitionUtcSec?: number;
  /** Offset in effect from transitionUtcSec onward. */
  transitionOffsetSec?: number;
  /** Wall-clock pseudo-epoch at/after which transitionOffsetSec applies. */
  transitionWallSec?: number;
}

/** Memoization for getDayZoneInfo (pure function of dateStr). */
const dayZoneCache = new Map<string, DayZoneInfo>();

/**
 * Compute (and memoize) the zone profile of a calendar day.
 */
function getDayZoneInfo(dateStr: string): DayZoneInfo {
  const cached = dayZoneCache.get(dateStr);
  if (cached) return cached;

  const [y, m, d] = dateStr.split('-').map(Number);
  const midnightWallSec = Date.UTC(y!, m! - 1, d!) / 1000;

  // Fixed-point iteration: guess local midnight as if UTC, correct by the
  // zone's offset at that instant, and re-evaluate at the corrected instant.
  // Converges in one correction because US transitions happen at 2 AM local,
  // so midnight never falls inside a transition.
  const firstGuessSec = midnightWallSec - zoneOffsetSec(midnightWallSec);
  const offsetSec = zoneOffsetSec(firstGuessSec);
  const midnightUtcSec = midnightWallSec - offsetSec;

  let info: DayZoneInfo = { midnightUtcSec, offsetSec };

  // If the offsets at the first and last second of the day differ, the day
  // contains a DST transition. Binary-search the flip instant (a handful of
  // Intl calls, computed once per date and memoized).
  if (zoneOffsetSec(midnightUtcSec + 86399) !== offsetSec) {
    let lo = midnightUtcSec;
    let hi = midnightUtcSec + 86399;
    while (lo < hi) {
      const mid = lo + Math.floor((hi - lo) / 2);
      if (zoneOffsetSec(mid) === offsetSec) lo = mid + 1;
      else hi = mid;
    }
    info = {
      midnightUtcSec,
      offsetSec,
      transitionUtcSec: lo,
      transitionOffsetSec: zoneOffsetSec(lo),
      // The new offset applies to wall times at or after the transition
      // instant displayed in the old offset (e.g. 02:00 on a spring-forward
      // day, which the old offset displays last before the gap).
      transitionWallSec: lo + offsetSec,
    };
  }

  dayZoneCache.set(dateStr, info);
  return info;
}

/**
 * UTC epoch second of local midnight (00:00:00) of the given date in the
 * transit timezone (08:00 UTC during PST, 07:00 UTC during PDT).
 */
export function getLocalMidnightUtcSec(dateStr: string): number {
  return getDayZoneInfo(dateStr).midnightUtcSec;
}

/**
 * Alias for `getLocalMidnightUtcSec`.
 */
export const getTransitDayStartEpoch = getLocalMidnightUtcSec;

/**
 * Resolve a local wall-clock time to a UTC epoch second.
 *
 * `secSinceMidnight` is seconds since local midnight of `dateStr` (the GTFS
 * convention, so values >= 86400 spill into the following calendar day and
 * negative values reach into the preceding one).
 *
 * `getLocalMidnightUtcSec(dateStr) + secSinceMidnight` is only correct when
 * no DST transition lies between local midnight and the target time. On a
 * spring-forward day like 2026-03-08 in Los Angeles (02:00 -> 03:00), a
 * 03:10 wall time is in PDT while midnight is PST, so the naive sum lands an
 * hour late; on a fall-back day like 2026-11-01 it lands an hour early.
 *
 * Instead, work on the naive local time line, where wall clocks are linear:
 * the target wall clock is `midnightWall(targetDay) + withinDaySec`, and the
 * offset in effect there is picked with a single comparison against the
 * day's transition point (see DayZoneInfo). All Intl work happens once per
 * calendar day inside getDayZoneInfo; this function is pure arithmetic.
 *
 * Edge cases: for the ambiguous fall-back hour (a wall time that occurs
 * twice) the first occurrence is used; for wall times skipped by a
 * spring-forward transition (02:00-02:59, which no real schedule should
 * contain) no instant displays that wall clock and the preceding real time
 * is returned.
 */
export function getLocalWallTimeUtcSec(dateStr: string, secSinceMidnight: number): number {
  const dayOffset = Math.floor(secSinceMidnight / 86400);
  const withinDaySec = secSinceMidnight - dayOffset * 86400;
  const info = getDayZoneInfo(addLocalDays(dateStr, dayOffset));

  // Target wall clock as a pseudo-epoch on the naive local time line.
  const targetWallSec = info.midnightUtcSec + info.offsetSec + withinDaySec;

  const offsetSec =
    info.transitionWallSec !== undefined && targetWallSec >= info.transitionWallSec
      ? info.transitionOffsetSec!
      : info.offsetSec;

  return targetWallSec - offsetSec;
}
