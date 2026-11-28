// SPDX-License-Identifier: MIT
// Copyright 2026 Roland Dreier <roland@rolandd.dev>

import { describe, it, expect } from 'vitest';
import {
  TRANSIT_DAY_CUTOFF_HOURS,
  getTransitDateStr,
  getTransitDateAtNoon,
  getTransitTimeStr,
  formatTransitDateLong,
  formatTransitDateSmart,
  classifyTripsByTime,
  formatScheduleEndDate,
  formatNoTripsDate,
  getTransitDayStartEpoch,
} from './time';

describe('time utilities', () => {
  it('formats transit date string (YYYY-MM-DD)', () => {
    const date = new Date('2026-05-15T18:00:00Z');
    const result = getTransitDateStr(date);
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('rolls over the transit service day at 3:00 AM cutoff', () => {
    expect(TRANSIT_DAY_CUTOFF_HOURS).toBe(3);
    // 11:30 PM PDT on 2026-09-16 -> service day 2026-09-16
    expect(getTransitDateStr(new Date('2026-09-16T23:30:00-07:00'))).toBe('2026-09-16');
    // 00:30 AM PDT on 2026-09-17 -> still service day 2026-09-16
    expect(getTransitDateStr(new Date('2026-09-17T00:30:00-07:00'))).toBe('2026-09-16');
    // 02:59 AM PDT on 2026-09-17 -> still service day 2026-09-16
    expect(getTransitDateStr(new Date('2026-09-17T02:59:59-07:00'))).toBe('2026-09-16');
    // 03:00 AM PDT on 2026-09-17 -> rolls over to 2026-09-17
    expect(getTransitDateStr(new Date('2026-09-17T03:00:00-07:00'))).toBe('2026-09-17');
    // 05:00 AM PDT on 2026-09-17 -> service day 2026-09-17
    expect(getTransitDateStr(new Date('2026-09-17T05:00:00-07:00'))).toBe('2026-09-17');
  });

  it('rolls over the transit service day correctly across DST boundaries', () => {
    // Spring forward: March 8, 2026 (clocks jump 01:59:59 PST -> 03:00:00 PDT)
    // 01:59:59 PST -> before 3 AM cutoff, belongs to 2026-03-07
    expect(getTransitDateStr(new Date('2026-03-08T01:59:59-08:00'))).toBe('2026-03-07');
    // 03:00:00 PDT -> at 3 AM cutoff, rolls over to 2026-03-08
    expect(getTransitDateStr(new Date('2026-03-08T03:00:00-07:00'))).toBe('2026-03-08');
    // 03:30:00 PDT -> after cutoff, belongs to 2026-03-08
    expect(getTransitDateStr(new Date('2026-03-08T03:30:00-07:00'))).toBe('2026-03-08');

    // Fall back: November 1, 2026 (clocks fall back 02:00:00 PDT -> 01:00:00 PST)
    // First 01:30:00 PDT -> before cutoff, belongs to 2026-10-31
    expect(getTransitDateStr(new Date('2026-11-01T01:30:00-07:00'))).toBe('2026-10-31');
    // Second 01:30:00 PST (repeated hour) -> before cutoff, belongs to 2026-10-31
    expect(getTransitDateStr(new Date('2026-11-01T01:30:00-08:00'))).toBe('2026-10-31');
    // 02:59:59 PST -> before cutoff, belongs to 2026-10-31
    expect(getTransitDateStr(new Date('2026-11-01T02:59:59-08:00'))).toBe('2026-10-31');
    // 03:00:00 PST -> at cutoff, rolls over to 2026-11-01
    expect(getTransitDateStr(new Date('2026-11-01T03:00:00-08:00'))).toBe('2026-11-01');
  });

  it('creates noon date without timezone coercion', () => {
    const noonDate = getTransitDateAtNoon('2026-05-15');
    expect(noonDate.getHours()).toBe(12);
  });

  it('formats transit time string (HH:MM)', () => {
    const date = new Date('2026-05-15T12:30:00Z');
    const timeStr = getTransitTimeStr(date);
    expect(timeStr).toMatch(/^\d{2}:\d{2}$/);
  });

  it('formats long transit date', () => {
    const date = new Date(2026, 4, 15, 12, 0, 0); // May 15, 2026
    const formatted = formatTransitDateLong(date);
    expect(formatted).toContain('May 15, 2026');
  });

  it('formats smart transit dates with relative hints and elided current year', () => {
    const ref = '2026-11-27';

    expect(formatTransitDateSmart('2026-11-27', ref)).toEqual({
      relative: 'Today',
      dateLabel: 'Fri, Nov 27',
      text: 'Today · Fri, Nov 27',
    });

    expect(formatTransitDateSmart('2026-11-28', ref)).toEqual({
      relative: 'Tomorrow',
      dateLabel: 'Sat, Nov 28',
      text: 'Tomorrow · Sat, Nov 28',
    });

    expect(formatTransitDateSmart('2026-11-26', ref)).toEqual({
      relative: 'Yesterday',
      dateLabel: 'Thu, Nov 26',
      text: 'Yesterday · Thu, Nov 26',
    });

    expect(formatTransitDateSmart('2026-12-05', ref)).toEqual({
      relative: undefined,
      dateLabel: 'Sat, Dec 5',
      text: 'Sat, Dec 5',
    });

    expect(formatTransitDateSmart('2027-01-15', ref)).toEqual({
      relative: undefined,
      dateLabel: 'Fri, Jan 15, 2027',
      text: 'Fri, Jan 15, 2027',
    });

    // Across year boundary: Tomorrow in the next year still shows Tomorrow + year
    expect(formatTransitDateSmart('2027-01-01', '2026-12-31')).toEqual({
      relative: 'Tomorrow',
      dateLabel: 'Fri, Jan 1, 2027',
      text: 'Tomorrow · Fri, Jan 1, 2027',
    });
  });

  it('classifies trips against current time including out-of-order delayed trains', () => {
    // Normal chronological departures: 10:00, 10:15, 10:30 at now = 10:10
    expect(classifyTripsByTime([600, 615, 630], 610)).toEqual({
      statuses: ['past', 'next', 'upcoming'],
      nextIndex: 1,
    });

    // Delayed 10:00 train (+30m -> 10:30), departed 10:10 train, on-time 10:25 train at now = 10:20
    expect(classifyTripsByTime([630, 610, 625], 620)).toEqual({
      statuses: ['upcoming', 'past', 'next'],
      nextIndex: 2,
    });

    // Equal effective departure times break ties in list order
    expect(classifyTripsByTime([625, 625, 640], 620)).toEqual({
      statuses: ['next', 'upcoming', 'upcoming'],
      nextIndex: 0,
    });

    // All trains already departed
    expect(classifyTripsByTime([500, 550], 600)).toEqual({
      statuses: ['past', 'past'],
      nextIndex: -1,
    });
  });

  it('formats schedule end date integer', () => {
    const formatted = formatScheduleEndDate(20261231);
    expect(formatted).toBe('December 31, 2026');
  });

  it('formats no trips date', () => {
    const date = new Date(2026, 4, 15, 12, 0, 0);
    const formatted = formatNoTripsDate(date);
    expect(formatted).toContain('May 15');
  });

  it('computes transit day start epoch seconds accurately across standard, daylight, and DST transition days', () => {
    // 2026-01-15 (PST, UTC-8): Midnight is 2026-01-15T08:00:00Z
    expect(getTransitDayStartEpoch('2026-01-15')).toBe(1768464000);

    // 2026-07-15 (PDT, UTC-7): Midnight is 2026-07-15T07:00:00Z
    expect(getTransitDayStartEpoch('2026-07-15')).toBe(1784098800);

    // 2026-03-08 (Spring Forward Sunday in US): At midnight, still PST (UTC-8)
    expect(getTransitDayStartEpoch('2026-03-08')).toBe(1772956800);

    // 2026-11-01 (Fall Back Sunday in US): At midnight, still PDT (UTC-7)
    expect(getTransitDayStartEpoch('2026-11-01')).toBe(1793516400);
  });
});
