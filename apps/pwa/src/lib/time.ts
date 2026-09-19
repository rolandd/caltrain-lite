// SPDX-License-Identifier: MIT
// Copyright 2026 Roland Dreier <roland@rolandd.dev>

export const TRANSIT_TIMEZONE = 'America/Los_Angeles';

// Cache formatters to improve runtime performance by avoiding repeated instantiation
const transitDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: TRANSIT_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const transitTimeFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: TRANSIT_TIMEZONE,
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const transitHourFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: TRANSIT_TIMEZONE,
  hour: 'numeric',
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
 * Caltrain transit operational day cutoff hour (3:00 AM).
 * Late-night trains operating past midnight (up to ~01:30 AM) belong to the previous day's
 * GTFS service schedule. Rolling over at 3:00 AM aligns the active service day with the
 * natural overnight service gap (01:30 AM - 04:30 AM).
 */
export const TRANSIT_DAY_CUTOFF_HOURS = 3;

/** Return today's service date string in the local transit timezone (YYYY-MM-DD), rolling over at 3:00 AM. */
export function getTransitDateStr(
  date: Date = new Date(),
  cutoffHours: number = TRANSIT_DAY_CUTOFF_HOURS,
): string {
  const dateStr = transitDateFormatter.format(date);
  const hourPart = transitHourFormatter.formatToParts(date).find((p) => p.type === 'hour');
  let hour = parseInt(hourPart?.value || '0', 10);
  if (hour === 24) hour = 0;

  if (hour < cutoffHours) {
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10);
  }
  return dateStr;
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

/**
 * Return the epoch seconds for midnight (00:00:00) of the given date in transit timezone.
 */
export function getTransitDayStartEpoch(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  // 08:00:00 UTC is either 00:00:00 PST (ptHour=0) or 01:00:00 PDT (ptHour=1).
  // In America/Los_Angeles, this UTC moment is always on the target date before the 2:00 AM DST shift.
  const guessMs = Date.UTC(y, m - 1, d, 8, 0, 0);
  const hourPart = transitHourFormatter
    .formatToParts(new Date(guessMs))
    .find((p) => p.type === 'hour');
  let ptHour = parseInt(hourPart?.value || '0', 10);
  if (ptHour === 24) ptHour = 0;
  return (guessMs - ptHour * 3600 * 1000) / 1000;
}
