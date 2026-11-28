// SPDX-License-Identifier: MIT
// Copyright 2026 Roland Dreier <roland@rolandd.dev>

import { TRANSIT_TIMEZONE, addLocalDays, getTransitDateStr } from '@packages/utils/time';

export {
  TRANSIT_TIMEZONE,
  TRANSIT_DAY_CUTOFF_HOURS,
  addLocalDays,
  formatTransitCalendarDate,
  getTransitDateStr,
  getLocalMidnightUtcSec,
  getTransitDayStartEpoch,
  getLocalWallTimeUtcSec,
} from '@packages/utils/time';

// Cache formatters to improve runtime performance by avoiding repeated instantiation
const transitTimeFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: TRANSIT_TIMEZONE,
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const formattedDateFormatter = new Intl.DateTimeFormat('en-US', {
  weekday: 'long',
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

const compactDateSameYearFormatter = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
});

const compactDateWithYearFormatter = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

const scheduleEndDateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'long',
  day: 'numeric',
  year: 'numeric',
});

const noTripsDateFormatter = new Intl.DateTimeFormat('en-US', {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
});

export interface SmartDateDisplay {
  /** Relative day hint when the date is within ±1 day of the reference transit date. */
  relative?: 'Today' | 'Tomorrow' | 'Yesterday';
  /** Compact weekday + month + day, including year only when different from reference year. */
  dateLabel: string;
  /** Full combined display string, e.g. "Today · Fri, Nov 27" or "Fri, Jan 1, 2027". */
  text: string;
}

export type TripTimeStatus = 'past' | 'next' | 'upcoming';

/**
 * Classify trips against `nowSec` using each trip's effective departure timestamp
 * (scheduled departure + realtime delay).
 *
 * Every trip with `effectiveDepSec < nowSec` is `'past'`. Among remaining future
 * trips, the one with the smallest `effectiveDepSec` (breaking ties by list order)
 * is `'next'`, and the rest are `'upcoming'`.
 */
export function classifyTripsByTime(
  effectiveDeparturesSec: readonly number[],
  nowSec: number,
): { statuses: TripTimeStatus[]; nextIndex: number } {
  let nextIndex = -1;
  let minFutureDep = Infinity;

  for (let i = 0; i < effectiveDeparturesSec.length; i++) {
    const depSec = effectiveDeparturesSec[i];
    if (depSec >= nowSec && depSec < minFutureDep) {
      minFutureDep = depSec;
      nextIndex = i;
    }
  }

  const statuses: TripTimeStatus[] = effectiveDeparturesSec.map((depSec, i) => {
    if (depSec < nowSec) return 'past';
    if (i === nextIndex) return 'next';
    return 'upcoming';
  });

  return { statuses, nextIndex };
}

/**
 * Given a YYYY-MM-DD string, return a Date object representing noon in local transit time.
 * This effectively prevents timezone coercion issues with pure date strings.
 */
export function getTransitDateAtNoon(dateStr: string): Date {
  return new Date(dateStr + 'T12:00:00');
}

/** Return "HH:MM" for the given date in local transit time (24-hour). */
export function getTransitTimeStr(date: Date = new Date()): string {
  return transitTimeFormatter.format(date);
}

/** Format a Date as "Wednesday, Aug 7, 2026". */
export function formatTransitDateLong(date: Date): string {
  return formattedDateFormatter.format(date);
}

/**
 * Format a YYYY-MM-DD transit date compactly with relative hints ("Today", "Tomorrow",
 * "Yesterday") and elide the year when it matches the reference transit date's year.
 */
export function formatTransitDateSmart(
  dateStr: string,
  referenceDateStr: string = getTransitDateStr(),
): SmartDateDisplay {
  if (!dateStr) {
    return { dateLabel: '', text: '' };
  }

  let relative: SmartDateDisplay['relative'];
  if (dateStr === referenceDateStr) {
    relative = 'Today';
  } else if (dateStr === addLocalDays(referenceDateStr, 1)) {
    relative = 'Tomorrow';
  } else if (dateStr === addLocalDays(referenceDateStr, -1)) {
    relative = 'Yesterday';
  }

  const sameYear = dateStr.slice(0, 4) === referenceDateStr.slice(0, 4);
  const noonDate = getTransitDateAtNoon(dateStr);
  const dateLabel = sameYear
    ? compactDateSameYearFormatter.format(noonDate)
    : compactDateWithYearFormatter.format(noonDate);

  return {
    relative,
    dateLabel,
    text: relative ? `${relative} · ${dateLabel}` : dateLabel,
  };
}

/** Given an integer date YYYYMMDD (e.g. 20261231), format as "December 31, 2026". */
export function formatScheduleEndDate(dateInt: number): string {
  const y = Math.floor(dateInt / 10000);
  const m = Math.floor((dateInt % 10000) / 100);
  const d = dateInt % 100;
  return scheduleEndDateFormatter.format(new Date(y, m - 1, d, 12, 0, 0));
}

/** Format a Date as "Wednesday, August 7". */
export function formatNoTripsDate(date: Date): string {
  return noTripsDateFormatter.format(date);
}
