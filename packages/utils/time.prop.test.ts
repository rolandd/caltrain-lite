// SPDX-License-Identifier: MIT
// Copyright 2026 Roland Dreier <roland@rolandd.dev>

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  TRANSIT_TIMEZONE,
  addLocalDays,
  formatTransitCalendarDate,
  getLocalMidnightUtcSec,
  getLocalWallTimeUtcSec,
} from './time';

const oracleFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: TRANSIT_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

function formatWallClockOracle(epochSec: number): { dateStr: string; withinDaySec: number } {
  const parts = oracleFormatter.formatToParts(new Date(epochSec * 1000));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';
  const y = get('year');
  const m = get('month');
  const d = get('day');
  const h = Number(get('hour')) % 24;
  const min = Number(get('minute'));
  const sec = Number(get('second'));
  return {
    dateStr: `${y}-${m}-${d}`,
    withinDaySec: h * 3600 + min * 60 + sec,
  };
}

/**
 * Generator biased toward DST transition dates and their neighbors,
 * combined with arbitrary dates across 2025-2027.
 */
const dateStrArb = fc.oneof(
  fc.constantFrom(
    '2026-01-15',
    '2026-03-07',
    '2026-03-08', // Spring forward (23h day)
    '2026-03-09',
    '2026-07-15',
    '2026-10-31',
    '2026-11-01', // Fall back (25h day)
    '2026-11-02',
  ),
  fc.integer({ min: 0, max: 1094 }).map((offsetDays) => addLocalDays('2025-01-01', offsetDays)),
);

describe('Property-Based Testing: Transit Time & DST Wall-Clock Resolution', () => {
  describe('Property 1: Wall-Clock Round-Trip Invariant across DST transitions', () => {
    it('formatting getLocalWallTimeUtcSec(dateStr, sec) in America/Los_Angeles recovers the exact target date and HH:MM:SS', () => {
      fc.assert(
        fc.property(
          dateStrArb,
          fc.integer({ min: -86400, max: 2 * 86400 - 1 }),
          (dateStr, secSinceMidnight) => {
            const dayOffset = Math.floor(secSinceMidnight / 86400);
            const withinDaySec = secSinceMidnight - dayOffset * 86400;
            const targetDateStr = addLocalDays(dateStr, dayOffset);

            // Exclude nonexistent wall times during the 02:00-02:59 spring-forward gap.
            const dayLengthSec =
              getLocalMidnightUtcSec(addLocalDays(targetDateStr, 1)) -
              getLocalMidnightUtcSec(targetDateStr);
            if (dayLengthSec === 82800 && withinDaySec >= 2 * 3600 && withinDaySec < 3 * 3600) {
              return;
            }

            const epochSec = getLocalWallTimeUtcSec(dateStr, secSinceMidnight);
            const actual = formatWallClockOracle(epochSec);

            expect(actual.dateStr).toBe(targetDateStr);
            expect(actual.withinDaySec).toBe(withinDaySec);
            expect(formatTransitCalendarDate(epochSec * 1000)).toBe(targetDateStr);
          },
        ),
        { numRuns: 1000 },
      );
    });
  });

  describe('Property 2: Day-Spill Equivalence Invariant', () => {
    it('shifting secSinceMidnight by k * 86400 equals shifting dateStr by k calendar days even across 23h/25h DST days', () => {
      fc.assert(
        fc.property(
          dateStrArb,
          fc.integer({ min: -86400, max: 2 * 86400 }),
          fc.integer({ min: -7, max: 7 }),
          (dateStr, secSinceMidnight, dayShift) => {
            const viaSec = getLocalWallTimeUtcSec(dateStr, secSinceMidnight + dayShift * 86400);
            const viaDate = getLocalWallTimeUtcSec(
              addLocalDays(dateStr, dayShift),
              secSinceMidnight,
            );
            expect(viaSec).toBe(viaDate);
          },
        ),
        { numRuns: 1000 },
      );
    });
  });

  describe('Property 3: Post-Cutoff Operational Service Day Linearity', () => {
    it('preserves exact elapsed differences (t2 - t1) for all service times from 03:00 AM through 01:59 AM next day', () => {
      fc.assert(
        fc.property(
          dateStrArb,
          fc.integer({ min: 3 * 3600, max: 26 * 3600 - 1 }),
          fc.integer({ min: 3 * 3600, max: 26 * 3600 - 1 }),
          (dateStr, a, b) => {
            const t1 = Math.min(a, b);
            const t2 = Math.max(a, b);
            const epoch1 = getLocalWallTimeUtcSec(dateStr, t1);
            const epoch2 = getLocalWallTimeUtcSec(dateStr, t2);

            // Because US DST transitions occur at 02:00 AM (inside the 01:30-04:30 AM
            // overnight service gap), the operational window [03:00, 26:00) never straddles
            // a transition and is strictly linear.
            expect(epoch2 - epoch1).toBe(t2 - t1);
          },
        ),
        { numRuns: 1000 },
      );
    });
  });

  describe('Property 4: Calendar Date Shift Group Law (addLocalDays)', () => {
    it('satisfies addLocalDays(addLocalDays(d, a), b) === addLocalDays(d, a + b)', () => {
      fc.assert(
        fc.property(
          dateStrArb,
          fc.integer({ min: -400, max: 400 }),
          fc.integer({ min: -400, max: 400 }),
          (dateStr, a, b) => {
            expect(addLocalDays(addLocalDays(dateStr, a), b)).toBe(addLocalDays(dateStr, a + b));
            expect(addLocalDays(dateStr, 0)).toBe(dateStr);
          },
        ),
        { numRuns: 500 },
      );
    });
  });
});
