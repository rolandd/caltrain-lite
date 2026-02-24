// SPDX-License-Identifier: MIT
// Copyright 2026 Roland Dreier <roland@rolandd.dev>

import { describe, it, expect } from 'vitest';
import { validateSchedule } from './validate-schedule.ts';
import type { StaticSchedule } from '../packages/types/schema.d.ts';

const VALID_MINIMAL: StaticSchedule = {
  m: { v: 'hash', e: 20261231, sv: 1 },
  s: {
    s1: { n: 'Station 1', z: 'Z1', ids: ['stop1'], lat: 0, lon: 0 },
    s2: { n: 'Station 2', z: 'Z2', ids: ['stop2'], lat: 1, lon: 1 },
    s3: { n: 'Station 3', z: 'Z3', ids: ['stop3'], lat: 2, lon: 2 },
    s4: { n: 'Station 4', z: 'Z4', ids: ['stop4'], lat: 3, lon: 3 },
    s5: { n: 'Station 5', z: 'Z5', ids: ['stop5'], lat: 4, lon: 4 },
    s6: { n: 'Station 6', z: 'Z6', ids: ['stop6'], lat: 5, lon: 5 },
    s7: { n: 'Station 7', z: 'Z7', ids: ['stop7'], lat: 6, lon: 6 },
    s8: { n: 'Station 8', z: 'Z8', ids: ['stop8'], lat: 7, lon: 7 },
    s9: { n: 'Station 9', z: 'Z9', ids: ['stop9'], lat: 8, lon: 8 },
    s10: { n: 'Station 10', z: 'Z10', ids: ['stop10'], lat: 9, lon: 9 },
  },
  t: Array(10)
    .fill(null)
    .map((_, i) => ({
      i: `trip${i}`,
      s: 'svc1',
      p: 'p1',
      d: 0,
      st: [0, 0, 10, 10],
      rt: 'Local',
    })),
  p: {
    p1: ['s1', 's2'],
    p2: ['s2', 's1'],
  },
  r: {
    c: { svc1: { days: [1, 1, 1, 1, 1, 0, 0], start: 20260101, end: 20261231 } },
    e: {},
  },
  f: { zones: {}, fares: {} },
  x: {},
  o: ['s1', 's2'],
};

describe('validateSchedule', () => {
  it('passes a valid minimal schedule', () => {
    const errors = validateSchedule(VALID_MINIMAL);
    expect(errors).toHaveLength(0);
  });

  it('fails on missing metadata', () => {
    const schedule = { ...VALID_MINIMAL, m: undefined as unknown as StaticSchedule['m'] };
    const errors = validateSchedule(schedule);
    expect(errors).toContain('Missing metadata (m)');
  });

  it('fails on too few stations', () => {
    const schedule = { ...VALID_MINIMAL, s: {} };
    const errors = validateSchedule(schedule);
    expect(errors.some((e) => e.includes('Too few stations'))).toBe(true);
  });

  it('fails on referential integrity errors (unknown station in pattern)', () => {
    const schedule = JSON.parse(JSON.stringify(VALID_MINIMAL));
    schedule.p.p1.push('unknown_station');
    const errors = validateSchedule(schedule);
    expect(errors).toContain('Pattern p1 references unknown station: unknown_station');
  });

  it('fails on referential integrity errors (unknown service in trip)', () => {
    const schedule = JSON.parse(JSON.stringify(VALID_MINIMAL));
    schedule.t[0].s = 'unknown_service';
    const errors = validateSchedule(schedule);
    expect(errors).toContain('Trip trip0 references unknown service: unknown_service');
  });

  it('fails on stop times length mismatch', () => {
    const schedule = JSON.parse(JSON.stringify(VALID_MINIMAL));
    schedule.t[0].st = [0, 0]; // Expected 4 for 2 stops
    const errors = validateSchedule(schedule);
    expect(errors.some((e) => e.includes('stop times length (2) mismatch pattern p1 (4)'))).toBe(
      true,
    );
  });

  it('fails on missing ordered station list', () => {
    const schedule = { ...VALID_MINIMAL, o: [] };
    const errors = validateSchedule(schedule);
    expect(errors).toContain('Missing or empty ordered station list (o)');
  });
});
