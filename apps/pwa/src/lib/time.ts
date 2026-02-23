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
