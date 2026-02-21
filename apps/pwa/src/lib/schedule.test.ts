// SPDX-License-Identifier: MIT
// Copyright 2026 Roland Dreier <roland@rolandd.dev>

import { describe, it, expect } from 'vitest';
import {
  queryTrips,
  calculateFare,
  getStationList,
  isServiceActive,
  getScheduleType,
} from './schedule';
import type { StaticSchedule } from './schedule';

/**
 * Mock schedule data matching the actual compact interface in schedule.ts.
 *
 * Trip fields: i=id, s=serviceId, p=patternId, d=direction, st=stopTimes, rt=routeType
 * Stop times are interleaved: [arr0, dep0, arr1, dep1, ...]
 * Calendar dates are YYYYMMDD integers.
 * Pair index x maps "origin→dest" to candidate trip IDs.
 */
const mockSchedule: StaticSchedule = {
  m: { v: 'test-v1', e: 2000000000, sv: 1000000 },
  s: {
    st1: { n: 'Station Alpha', z: '1', ids: ['st1'], lat: 10, lon: 10 },
    st2: { n: 'Station Bravo', z: '2', ids: ['st2'], lat: 20, lon: 20 },
    st3: { n: 'Station Charlie', z: '3', ids: ['st3'], lat: 30, lon: 30 },
  },
  o: ['st3', 'st2', 'st1'], // Explicitly reverse order for testing
  p: {
    p1: ['st1', 'st2', 'st3'], // Local pattern: all 3 stops
    p2: ['st1', 'st3'], // Express pattern: skips st2
  },
  t: [
    {
      i: '101',
      s: 'wkd',
      p: 'p1',
      d: 0,
      // st1: arr 600, dep 600 | st2: arr 630, dep 632 | st3: arr 660, dep 660
      st: [600, 600, 630, 632, 660, 660],
      rt: 'Local',
    },
    {
      i: '201',
      s: 'wkd',
      p: 'p1',
      d: 0,
      // st1: arr 720, dep 720 | st2: arr 750, dep 752 | st3: arr 780, dep 780
      st: [720, 720, 750, 752, 780, 780],
      rt: 'Limited',
    },
    {
      i: '301',
      s: 'sat',
      p: 'p2',
      d: 0,
      // st1: arr 600, dep 600 | st3: arr 650, dep 650
      st: [600, 600, 650, 650],
      rt: 'Local',
    },
  ],
  r: {
    c: {
      wkd: { start: 20240101, end: 20251231, days: [1, 1, 1, 1, 1, 0, 0] }, // Mon–Fri
      sat: { start: 20240101, end: 20251231, days: [0, 0, 0, 0, 0, 1, 0] }, // Sat only
    },
    e: {
      wkd: [{ date: 20240115, type: 2 }], // MLK Day — service removed
    },
  },
  f: {
    zones: { '1': { name: 'Zone 1' }, '2': { name: 'Zone 2' }, '3': { name: 'Zone 3' } },
    fares: { '1→2': 500, '1→3': 700, '2→3': 400 },
  },
  // Pair index: maps "origin→dest" to trip IDs that serve the pair
  x: {
    'st1→st2': ['101', '201'],
    'st1→st3': ['101', '201', '301'],
    'st2→st3': ['101', '201'],
  },
};

// ---- Station List ----

describe('getStationList', () => {
  it('returns stations in the order specified by the schedule', () => {
    const list = getStationList(mockSchedule);
    expect(list).toHaveLength(3);
    expect(list[0].id).toBe('st3');
    expect(list[1].id).toBe('st2');
    expect(list[2].id).toBe('st1');
  });

  it('falls back to alphabetical sorting if order is missing', () => {
    const scheduleWithoutOrder = { ...mockSchedule } as unknown as StaticSchedule;
    delete (scheduleWithoutOrder as Partial<StaticSchedule>).o;
    const list = getStationList(scheduleWithoutOrder);
    expect(list[0].name).toBe('Station Alpha');
    expect(list[1].name).toBe('Station Bravo');
    expect(list[2].name).toBe('Station Charlie');
  });
});

import { normalizeDate } from './schedule';

describe('normalizeDate', () => {
  it('handles standard valid dates', () => {
    expect(normalizeDate('2026-02-17')).toBe('2026-02-17');
  });

  it('normalizes Feb 30th to March 2nd', () => {
    expect(normalizeDate('2026-02-30')).toBe('2026-03-02');
  });

  it('normalizes day 0 to the last day of previous month', () => {
    // 2026-02-00 -> 2026-01-31
    expect(normalizeDate('2026-02-00')).toBe('2026-01-31');
  });

  it('handles leap years correctly', () => {
    // 2024 was a leap year
    expect(normalizeDate('2024-02-29')).toBe('2024-02-29');
    expect(normalizeDate('2026-02-29')).toBe('2026-03-01');
  });
});

// ---- Service Calendar ----

describe('isServiceActive', () => {
  it('weekday service is active on a Monday', () => {
    expect(isServiceActive(mockSchedule, 'wkd', new Date('2024-01-08T12:00:00'))).toBe(true);
  });

  it('weekday service is inactive on a Saturday', () => {
    expect(isServiceActive(mockSchedule, 'wkd', new Date('2024-01-06T12:00:00'))).toBe(false);
  });

  it('saturday service is active on a Saturday', () => {
    expect(isServiceActive(mockSchedule, 'sat', new Date('2024-01-06T12:00:00'))).toBe(true);
  });

  it('weekday service is removed on exception date (MLK Day)', () => {
    expect(isServiceActive(mockSchedule, 'wkd', new Date('2024-01-15T12:00:00'))).toBe(false);
  });

  it('service outside date range is inactive', () => {
    expect(isServiceActive(mockSchedule, 'wkd', new Date('2030-01-07T12:00:00'))).toBe(false);
  });
});

// ---- Schedule Type ----

describe('getScheduleType', () => {
  it('identifies standard weekday', () => {
    // 2024-01-08 is a Monday
    expect(getScheduleType(mockSchedule, new Date('2024-01-08T12:00:00'))).toBe('Weekday');
  });

  it('identifies standard weekend', () => {
    // 2024-01-06 is a Saturday
    expect(getScheduleType(mockSchedule, new Date('2024-01-06T12:00:00'))).toBe('Weekend');
  });

  it('identifies holiday as special (if a weekend schedule ran on a weekday)', () => {
    // Let's add a mock holiday exception to the test schedule where Saturday schedule runs on a Monday
    const sched = JSON.parse(JSON.stringify(mockSchedule)) as StaticSchedule;
    sched.r.e['sat'] = [{ date: 20240115, type: 1 }]; // Add Sat service on Monday
    // Note: mockSchedule already has wkd service removed on 2024-01-15 (MLK Day)
    // 2024-01-15 is Monday, but running Saturday service (days[0] === 0).
    expect(getScheduleType(sched, new Date('2024-01-15T12:00:00'))).toBe('Special');
  });

  it('identifies day with no active services as null', () => {
    expect(getScheduleType(mockSchedule, new Date('2024-01-15T12:00:00'))).toBeNull();
  });
});

// ---- Trip Query ----

describe('queryTrips', () => {
  it('finds weekday trips between st1 and st3', () => {
    const trips = queryTrips(mockSchedule, 'st1', 'st3', new Date('2024-01-08T12:00:00')); // Monday
    expect(trips).toHaveLength(2);
    expect(trips[0].trainNumber).toBe('101');
    expect(trips[1].trainNumber).toBe('201');
  });

  it('finds saturday trips between st1 and st3', () => {
    const trips = queryTrips(mockSchedule, 'st1', 'st3', new Date('2024-01-06T12:00:00')); // Saturday
    expect(trips).toHaveLength(1);
    expect(trips[0].trainNumber).toBe('301');
  });

  it('removes weekday trips on exception date', () => {
    const trips = queryTrips(mockSchedule, 'st1', 'st3', new Date('2024-01-15T12:00:00')); // MLK Monday
    expect(trips).toHaveLength(0);
  });

  it('returns empty for unknown station pair', () => {
    const trips = queryTrips(mockSchedule, 'st3', 'st1', new Date('2024-01-08T12:00:00')); // Reverse
    expect(trips).toHaveLength(0);
  });

  it('results are sorted by departure time', () => {
    const trips = queryTrips(mockSchedule, 'st1', 'st2', new Date('2024-01-08T12:00:00'));
    expect(trips).toHaveLength(2);
    expect(trips[0].departureMinutes).toBeLessThan(trips[1].departureMinutes);
  });

  it('formats departure / arrival / duration', () => {
    const trips = queryTrips(mockSchedule, 'st1', 'st3', new Date('2024-01-08T12:00:00'));
    const t = trips[0]; // train 101
    expect(t.departure).toBe('10:00');
    expect(t.arrival).toBe('11:00');
    expect(t.duration).toBe('1h');
  });

  it('includes raw durationMinutes', () => {
    const trips = queryTrips(mockSchedule, 'st1', 'st3', new Date('2024-01-08T12:00:00'));
    const t = trips[0]; // train 101: dep 600, arr 660
    expect(t.durationMinutes).toBe(60);
  });

  it('counts intermediate stops for local trip (p1: st1→st2→st3)', () => {
    const trips = queryTrips(mockSchedule, 'st1', 'st3', new Date('2024-01-08T12:00:00'));
    // p1 pattern: [st1, st2, st3] → originIdx=0, destIdx=2 → 1 intermediate stop
    expect(trips[0].intermediateStops).toBe(1);
  });

  it('counts intermediate stops for express trip (p2: st1→st3, skips st2)', () => {
    const trips = queryTrips(mockSchedule, 'st1', 'st3', new Date('2024-01-06T12:00:00')); // Saturday
    // p2 pattern: [st1, st3] → originIdx=0, destIdx=1 → 0 intermediate stops
    expect(trips[0].intermediateStops).toBe(0);
  });
});

// ---- Fare Calculation ----

describe('calculateFare', () => {
  it('returns fare between adjacent zones', () => {
    expect(calculateFare(mockSchedule, 'st1', 'st2')).toBe(500);
  });

  it('returns fare across multiple zones', () => {
    expect(calculateFare(mockSchedule, 'st1', 'st3')).toBe(700);
  });

  it('returns null for unknown station', () => {
    expect(calculateFare(mockSchedule, 'st1', 'bad_id')).toBeNull();
  });

  it('returns null for pair without a fare entry', () => {
    // Zone 3 → Zone 1 is not in the fares map
    expect(calculateFare(mockSchedule, 'st3', 'st1')).toBeNull();
  });
});
