import { describe, it, expect } from 'vitest';
import { queryTrips, calculateFare, getStationList, isServiceActive } from './schedule';
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
  m: { v: 'test-v1', e: 2000000000, u: 1000000 },
  s: {
    st1: { n: 'Station Alpha', z: '1', ids: ['st1'] },
    st2: { n: 'Station Bravo', z: '2', ids: ['st2'] },
    st3: { n: 'Station Charlie', z: '3', ids: ['st3'] },
  },
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
  it('returns all stations sorted by name', () => {
    const list = getStationList(mockSchedule);
    expect(list).toHaveLength(3);
    expect(list[0].name).toBe('Station Alpha');
    expect(list[1].name).toBe('Station Bravo');
    expect(list[2].name).toBe('Station Charlie');
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
