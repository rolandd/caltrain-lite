// SPDX-License-Identifier: MIT
// Copyright 2026 Roland Dreier <roland@rolandd.dev>

import { TRANSIT_TIMEZONE } from '@packages/utils/time';

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
