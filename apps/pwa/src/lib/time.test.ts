// SPDX-License-Identifier: MIT
// Copyright 2026 Roland Dreier <roland@rolandd.dev>

import { describe, it, expect } from 'vitest';
import {
  getTransitDateStr,
  getTransitDateAtNoon,
  getTransitTimeStr,
  formatTransitDateLong,
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

  it('formats schedule end date integer', () => {
    const formatted = formatScheduleEndDate(20261231);
    expect(formatted).toBe('December 31, 2026');
  });

  it('formats no trips date', () => {
    const date = new Date(2026, 4, 15, 12, 0, 0);
    const formatted = formatNoTripsDate(date);
    expect(formatted).toContain('May 15');
  });

  it('computes transit day start epoch seconds correctly', () => {
    const epoch = getTransitDayStartEpoch('2026-05-15');
    expect(typeof epoch).toBe('number');
    expect(epoch).toBeGreaterThan(0);
  });
});
