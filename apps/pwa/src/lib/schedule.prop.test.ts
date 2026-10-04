// SPDX-License-Identifier: MIT
// Copyright 2026 Roland Dreier <roland@rolandd.dev>

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { queryTrips, getCanonicalStationId, type StaticSchedule, type Trip } from './schedule';
import realSchedule from './schedule-data.json';

describe('Property-Based Testing: Schedule & Trip Querying', () => {
  // Real Caltrain schedule setup
  const v1Schedule = realSchedule as StaticSchedule;
  const v2Schedule: StaticSchedule = { ...(realSchedule as StaticSchedule) };
  delete v2Schedule.x;

  const stationIds = Object.keys(realSchedule.s);

  describe('Property 1: Differential Equivalence (v1 with x vs v2 without x)', () => {
    it('produces identical query results for ANY station pair and ANY date across the calendar', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...stationIds),
          fc.constantFrom(...stationIds),
          fc.date({ min: new Date('2024-01-01T00:00:00Z'), max: new Date('2026-12-31T23:59:59Z') }),
          (origin, destination, date) => {
            const v1Results = queryTrips(v1Schedule, origin, destination, date);
            const v2Results = queryTrips(v2Schedule, origin, destination, date);

            expect(v2Results).toEqual(v1Results);
          },
        ),
        { numRuns: 1000 },
      );
    });
  });

  describe('Property 2: Query Result Invariants', () => {
    it('guarantees monotonicity, directional consistency, and duration math on all returned trips', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...stationIds),
          fc.constantFrom(...stationIds),
          fc.date({ min: new Date('2024-01-01T00:00:00Z'), max: new Date('2026-12-31T23:59:59Z') }),
          (origin, destination, date) => {
            const trips = queryTrips(v2Schedule, origin, destination, date);

            if (trips.length === 0) return;

            const canonOrigin = getCanonicalStationId(v2Schedule, origin);
            const canonDest = getCanonicalStationId(v2Schedule, destination);

            // Invariant A: Sorted by departure time non-decreasing
            for (let i = 0; i < trips.length - 1; i++) {
              expect(trips[i].departureMinutes).toBeLessThanOrEqual(trips[i + 1].departureMinutes);
            }

            // Invariant B: All trips in the result share the exact same direction (0 NB or 1 SB)
            const expectedDirection = trips[0].direction;
            for (const trip of trips) {
              expect(trip.direction).toBe(expectedDirection);

              // Invariant C: Duration is arrival minus departure
              expect(trip.durationMinutes).toBe(trip.arrivalMinutes - trip.departureMinutes);

              // Invariant D: Stop count equals slice length minus origin and destination
              expect(trip.intermediateStops).toBe(trip.stopIds.length - 2);

              // Invariant E: Stop list starts at origin and ends at destination
              expect(trip.stopIds[0]).toBe(canonOrigin);
              expect(trip.stopIds[trip.stopIds.length - 1]).toBe(canonDest);
            }
          },
        ),
        { numRuns: 500 },
      );
    });
  });

  describe('Property 3: Synthetic Schedule Equivalence', () => {
    // Generator for arbitrary synthetic stations
    const stationIdArb = fc.stringMatching(/^[a-z]{3,6}$/);

    it('v1 and v2 match on arbitrarily generated schedules and patterns', () => {
      const syntheticScheduleArb = fc
        .uniqueArray(stationIdArb, { minLength: 4, maxLength: 8 })
        .chain((stations) => {
          // Generate 2-4 distinct patterns as ordered sub-sequences of stations
          const patternArb = fc.shuffledSubarray(stations, {
            minLength: 2,
            maxLength: stations.length,
          });
          return fc.record({
            stations: fc.constant(stations),
            patterns: fc.array(patternArb, { minLength: 2, maxLength: 4 }),
          });
        })
        .chain(({ stations, patterns }) => {
          const patternRecord: Record<string, string[]> = {};
          patterns.forEach((p, idx) => {
            patternRecord[`p${idx}`] = p;
          });

          const patternKeys = Object.keys(patternRecord);

          // Generate trips mapped to these patterns with unique train IDs
          const tripsArb = fc
            .uniqueArray(
              fc.record({
                idNum: fc.integer({ min: 100, max: 999 }),
                s: fc.constant('svc_all'),
                p: fc.constantFrom(...patternKeys),
                d: fc.constantFrom(0 as const, 1 as const),
                startMinute: fc.integer({ min: 300, max: 1200 }),
              }),
              { selector: (t) => t.idNum, minLength: 1, maxLength: 10 },
            )
            .map((rawTrips): Trip[] =>
              rawTrips.map(({ idNum, s, p, d, startMinute }): Trip => {
                const numStops = patternRecord[p].length;
                const st: number[] = [];
                let current = startMinute;
                for (let stopIdx = 0; stopIdx < numStops; stopIdx++) {
                  st.push(current, current + 1); // arr, dep
                  current += 10; // 10 mins to next stop
                }
                return {
                  i: String(idNum),
                  s,
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
          });
        })
        .map(
          ({
            stations,
            patterns,
            trips,
          }): { v1: StaticSchedule; v2: StaticSchedule; stations: string[] } => {
            const stationRecord: StaticSchedule['s'] = {};
            stations.forEach((id) => {
              stationRecord[id] = { n: id, z: '1', ids: [id], lat: 0, lon: 0 };
            });

            // Precompute pair index x for v1
            const x: Record<string, string[]> = {};
            for (const trip of trips) {
              const stops = patterns[trip.p];
              for (let oIdx = 0; oIdx < stops.length; oIdx++) {
                for (let dIdx = oIdx + 1; dIdx < stops.length; dIdx++) {
                  const key = `${stops[oIdx]}→${stops[dIdx]}`;
                  if (!x[key]) x[key] = [];
                  x[key].push(trip.i);
                }
              }
            }

            const baseSchedule: StaticSchedule = {
              m: { v: 'test', e: 20300101, sv: 1 },
              s: stationRecord,
              o: stations,
              p: patterns,
              t: trips,
              r: {
                c: { svc_all: { start: 20200101, end: 20300101, days: [1, 1, 1, 1, 1, 1, 1] } },
                e: {},
              },
              f: { zones: { '1': { name: 'Zone 1' } }, fares: {} },
            };

            const v1: StaticSchedule = { ...baseSchedule, x };
            const v2: StaticSchedule = { ...baseSchedule };

            return { v1, v2, stations };
          },
        );

      fc.assert(
        fc.property(
          syntheticScheduleArb,
          fc.date({ min: new Date('2024-01-01'), max: new Date('2026-12-31') }),
          ({ v1, v2, stations }, date) => {
            // Pick any random pair of stations
            for (const origin of stations) {
              for (const destination of stations) {
                const r1 = queryTrips(v1, origin, destination, date);
                const r2 = queryTrips(v2, origin, destination, date);
                expect(r2).toEqual(r1);
              }
            }
          },
        ),
        { numRuns: 50 },
      );
    });
  });
});
