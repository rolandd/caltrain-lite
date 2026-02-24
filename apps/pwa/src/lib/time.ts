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

/** Return today's date string in the local transit timezone (YYYY-MM-DD). */
export function getTransitDateStr(date: Date = new Date()): string {
  return transitDateFormatter.format(date);
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

/**
 * Return the epoch seconds for midnight (00:00:00) of the given date in transit timezone.
 */
export function getTransitDayStartEpoch(dateStr: string): number {
  // Construct a Date at noon UTC on the target date.
  const d = new Date(`${dateStr}T12:00:00Z`);
  // See what hour it is in the transit timezone at that UTC moment.
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: TRANSIT_TIMEZONE,
    hour: 'numeric',
    hour12: false,
  });
  const hourPart = formatter.formatToParts(d).find((p) => p.type === 'hour');
  const ptHour = parseInt(hourPart?.value || '12', 10);
  // Noon UTC (12) -> ptHour (e.g. 4 for PST). The difference is the UTC offset.
  // Note: ptHour can be 24 instead of 0 in some environments, but since we use Noon UTC,
  // it will be e.g. 4 or 5 AM PT.
  const offsetHours = 12 - ptHour;
  // Midnight PT (wall-clock) is 0:00 PT.
  // Midnight UTC is d.getTime() - 12 hours.
  // Midnight PT (in UTC) is Midnight UTC + offsetHours.
  return d.getTime() / 1000 - 12 * 3600 + offsetHours * 3600;
}
