// SPDX-License-Identifier: MIT
// Copyright 2026 Roland Dreier <roland@rolandd.dev>

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { toV2Schedule, SCHEMA_VERSION_V2 } from './parse-gtfs';
import { validateSchedule } from './validate-schedule';
import type { StaticSchedule, Trip } from '../packages/types/schema.d.ts';

describe('Property-Based Testing: GTFS Pipeline & Schedule Invariants', () => {
  // Arbitrary generator for structurally sound synthetic StaticSchedule objects
  const validScheduleArb = fc
    .uniqueArray(fc.stringMatching(/^[a-z]{3,6}$/), { minLength: 10, maxLength: 20 })
    .chain((stations) => {
      const patternStopsArb = fc.shuffledSubarray(stations, {
        minLength: 2,
        maxLength: stations.length,
      });

      return fc.record({
        stations: fc.constant(stations),
        patterns: fc.array(patternStopsArb, { minLength: 2, maxLength: 6 }),
        versionHash: fc.stringMatching(/^[0-9a-f]{16,32}$/),
        endDate: fc.integer({ min: 20260101, max: 20351231 }),
      });
    })
    .chain(({ stations, patterns, versionHash, endDate }) => {
      const patternRecord: Record<string, string[]> = {};
      patterns.forEach((p, idx) => {
        patternRecord[`p${idx}`] = p;
      });
      const patternKeys = Object.keys(patternRecord);

      // Trips generator
      const tripsArb = fc
        .array(
          fc.record({
            idNum: fc.integer({ min: 100, max: 999 }),
            p: fc.constantFrom(...patternKeys),
            d: fc.constantFrom(0 as const, 1 as const),
            startMinute: fc.integer({ min: 300, max: 1200 }),
          }),
          { minLength: 10, maxLength: 30 },
        )
        .map((rawTrips): Trip[] =>
          rawTrips.map(({ idNum, p, d, startMinute }): Trip => {
            const numStops = patternRecord[p]!.length;
            const st: number[] = [];
            let current = startMinute;
            for (let i = 0; i < numStops; i++) {
              st.push(current, current + 1);
              current += 10;
            }
            return {
              i: String(idNum),
              s: 'svc_standard',
              p,
              d,
              st,
              rt: 'Local',
            };
          }),
        );

      return fc.record({
        stations: fc.constant(stations),
        patterns: fc.constant(patternRecord),
        trips: tripsArb,
        versionHash: fc.constant(versionHash),
        endDate: fc.constant(endDate),
      });
    })
    .map(({ patterns, trips, versionHash, endDate }): StaticSchedule | null => {
      // Only stations actually served by a pattern may appear in s and o:
      // validateSchedule enforces that every station has trips (the parser
      // prunes unserved stations) and that o is a permutation of s.
      const usedStations = [...new Set(Object.values(patterns).flat())];
      if (usedStations.length < 10) return null; // validator requires >= 10

      const stationRecord: StaticSchedule['s'] = {};
      usedStations.forEach((id, idx) => {
        stationRecord[id] = {
          n: `Station ${id.toUpperCase()}`,
          z: String((idx % 5) + 1),
          ids: [`stop_${id}_1`, `stop_${id}_2`],
          lat: 37.0 + idx * 0.05,
          lon: -122.0 - idx * 0.05,
        };
      });

      // Precompute pair index x
      const x: Record<string, string[]> = {};
      for (const trip of trips) {
        const stops = patterns[trip.p]!;
        for (let i = 0; i < stops.length; i++) {
          for (let j = i + 1; j < stops.length; j++) {
            const key = `${stops[i]}→${stops[j]}`;
            (x[key] ??= []).push(trip.i);
          }
        }
      }

      return {
        m: { v: versionHash, e: endDate, sv: 1 },
        s: stationRecord,
        o: usedStations,
        p: patterns,
        t: trips,
        r: {
          c: {
            svc_standard: {
              start: 20260101,
              end: endDate,
              days: [1, 1, 1, 1, 1, 1, 1],
            },
          },
          e: {},
        },
        f: { zones: {}, fares: {} },
        x,
      };
    })
    .filter((schedule): schedule is StaticSchedule => schedule !== null);

  describe('toV2Schedule Conversion Invariants', () => {
    it('sets schema version to 2 and completely removes pair index x without mutating original', () => {
      fc.assert(
        fc.property(validScheduleArb, (schedule) => {
          expect(schedule.x).toBeDefined();

          const v2 = toV2Schedule(schedule);

          // Invariant 1: sv === 2
          expect(v2.m.sv).toBe(SCHEMA_VERSION_V2);

          // Invariant 2: x is deleted
          expect(v2.x).toBeUndefined();
          expect('x' in v2).toBe(false);

          // Invariant 3: Original schedule is unchanged (non-destructive)
          expect(schedule.x).toBeDefined();
          expect(schedule.m.sv).toBe(1);

          // Invariant 4: All other fields preserved identically
          expect(v2.m.v).toBe(schedule.m.v);
          expect(v2.m.e).toBe(schedule.m.e);
          expect(v2.s).toEqual(schedule.s);
          expect(v2.p).toEqual(schedule.p);
          expect(v2.t).toEqual(schedule.t);
          expect(v2.r).toEqual(schedule.r);
          expect(v2.o).toEqual(schedule.o);
          expect(v2.f).toEqual(schedule.f);
        }),
        { numRuns: 100 },
      );
    });

    it('is idempotent: toV2Schedule(toV2Schedule(s)) is identical to toV2Schedule(s)', () => {
      fc.assert(
        fc.property(validScheduleArb, (schedule) => {
          const v2Once = toV2Schedule(schedule);
          const v2Twice = toV2Schedule(v2Once);

          expect(v2Twice).toEqual(v2Once);
        }),
        { numRuns: 100 },
      );
    });
  });

  describe('Schedule Validation Soundness & Fault Injection', () => {
    it('soundness: all generated valid schedules pass validateSchedule with zero errors', () => {
      fc.assert(
        fc.property(validScheduleArb, (schedule) => {
          const errors = validateSchedule(schedule);
          expect(errors).toHaveLength(0);

          const v2Errors = validateSchedule(toV2Schedule(schedule));
          expect(v2Errors).toHaveLength(0);
        }),
        { numRuns: 100 },
      );
    });

    it('fault injection: detects invalid end date (m.e < 20260101)', () => {
      fc.assert(
        fc.property(
          validScheduleArb,
          fc.integer({ min: 19700101, max: 20251231 }),
          (schedule, badEndDate) => {
            const mutated: StaticSchedule = {
              ...schedule,
              m: { ...schedule.m, e: badEndDate },
            };
            const errors = validateSchedule(mutated);
            expect(errors.some((e) => e.includes('Invalid end date'))).toBe(true);
          },
        ),
        { numRuns: 100 },
      );
    });

    it('fault injection: detects unknown station referenced in pattern', () => {
      fc.assert(
        fc.property(
          validScheduleArb,
          fc.stringMatching(/^ghost_[a-z]{3}$/),
          (schedule, ghostStop) => {
            const firstPatKey = Object.keys(schedule.p)[0]!;
            const mutated: StaticSchedule = {
              ...schedule,
              p: {
                ...schedule.p,
                [firstPatKey]: [...schedule.p[firstPatKey]!, ghostStop],
              },
            };
            const errors = validateSchedule(mutated);
            expect(errors.some((e) => e.includes(`references unknown station: ${ghostStop}`))).toBe(
              true,
            );
          },
        ),
        { numRuns: 100 },
      );
    });

    it('fault injection: detects unknown service referenced by trip', () => {
      fc.assert(
        fc.property(validScheduleArb, (schedule) => {
          const mutatedTrips = [...schedule.t];
          mutatedTrips[0] = { ...mutatedTrips[0]!, s: 'ghost_service_xyz' };
          const mutated: StaticSchedule = {
            ...schedule,
            t: mutatedTrips,
          };
          const errors = validateSchedule(mutated);
          expect(
            errors.some((e) => e.includes('references unknown service: ghost_service_xyz')),
          ).toBe(true);
        }),
        { numRuns: 100 },
      );
    });

    it('fault injection: detects stop times length mismatch against pattern', () => {
      fc.assert(
        fc.property(validScheduleArb, (schedule) => {
          const mutatedTrips = [...schedule.t];
          // Truncate stop times by 2 values
          mutatedTrips[0] = { ...mutatedTrips[0]!, st: mutatedTrips[0]!.st.slice(0, -2) };
          const mutated: StaticSchedule = {
            ...schedule,
            t: mutatedTrips,
          };
          const errors = validateSchedule(mutated);
          expect(errors.some((e) => e.includes('mismatch pattern'))).toBe(true);
        }),
        { numRuns: 100 },
      );
    });
  });
});
