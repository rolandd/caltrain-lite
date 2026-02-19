// SPDX-License-Identifier: MIT
// Copyright 2026 Roland Dreier <roland@rolandd.dev>

import { describe, it, expect } from 'vitest';
import { getTrainLocationDescription } from './location';
import type { StaticSchedule } from './schedule';
import type { VehiclePosition } from '@packages/types/schema';

// Mock minimal schedule with just stations
const mockSchedule: StaticSchedule = {
  m: { v: '1', e: 0, u: 0, sv: 1 },
  p: {},
  t: [],
  r: { c: {}, e: {} },
  f: { zones: {}, fares: {} },
  x: {},
  // Order: SF (North) -> ... -> SJ (South)
  o: ['sf', 'san_mateo', 'sj'],
  s: {
    sf: { n: 'San Francisco', z: '1', ids: ['1'], lat: 37.776, lon: -122.395 }, // ~Lat 37.77
    san_mateo: { n: 'San Mateo', z: '2', ids: ['2'], lat: 37.568, lon: -122.324 }, // ~Lat 37.56
    sj: { n: 'San Jose', z: '4', ids: ['3'], lat: 37.33, lon: -121.903 }, // ~Lat 37.33
  },
} as unknown as StaticSchedule;

describe('getTrainLocationDescription', () => {
  it('returns "At [Station]" when within 250m', () => {
    // Exact location of San Mateo
    const pos: VehiclePosition = { la: 37.568, lo: -122.324 };
    expect(getTrainLocationDescription(pos, 0, mockSchedule)).toBe('At San Mateo');
    expect(getTrainLocationDescription(pos, 1, mockSchedule)).toBe('At San Mateo');
  });

  it('returns "At [Station]" when slightly offset but < 250m', () => {
    // 0.001 deg lat is roughly 111m. 0.0005 is ~55m.
    const pos: VehiclePosition = { la: 37.5685, lo: -122.324 };
    expect(getTrainLocationDescription(pos, 0, mockSchedule)).toBe('At San Mateo');
  });

  it('Example: Southbound train North of San Mateo', () => {
    // Train is at Lat 37.60 (North of San Mateo 37.568)
    // Moving South (d=1). Next station South is San Mateo.
    // Distance approx: 37.60 - 37.568 = 0.032 deg ~= 3.5 km
    const pos: VehiclePosition = { la: 37.6, lo: -122.33 }; // Rough longitude match

    // Expect: "X km North of San Mateo"
    const desc = getTrainLocationDescription(pos, 1, mockSchedule);
    expect(desc).toMatch(/km North of San Mateo$/);
  });

  it('Example: Northbound train South of San Mateo', () => {
    // Train is at Lat 37.50 (South of San Mateo 37.568)
    // Moving North (d=0). Next station North is San Mateo.
    const pos: VehiclePosition = { la: 37.5, lo: -122.3 };

    // Expect: "X km South of San Mateo"
    const desc = getTrainLocationDescription(pos, 0, mockSchedule);
    expect(desc).toMatch(/km South of San Mateo$/);
  });

  it('returns "In Transit" if no station found in direction', () => {
    // Train is North of SF (Lat 37.80 > SF 37.776)
    // Moving North (d=0). No station further north.
    const pos: VehiclePosition = { la: 37.8, lo: -122.4 };
    expect(getTrainLocationDescription(pos, 0, mockSchedule)).toBe('In Transit');
  });
});
