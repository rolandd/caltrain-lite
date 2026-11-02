// SPDX-License-Identifier: MIT
// Copyright 2026 Roland Dreier <roland@rolandd.dev>

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  interpolateCurve,
  inverseCurve,
  estimateDelay,
  computeDistanceBehind,
} from './delay-estimation';
import type { StaticSchedule, Trip, TripPerformance } from '@packages/types/schema';

describe('Property-Based Testing: Delay Estimation Curve Inversion & Interpolation', () => {
  // Generator for strictly increasing 10-bin progress curves with values strictly in (0, 1)
  const strictlyIncreasingCurveArb = fc
    .uniqueArray(fc.integer({ min: 1, max: 9999 }), { minLength: 10, maxLength: 10 })
    .map((arr) => arr.sort((a, b) => a - b).map((val) => val / 10000));

  // Generator for arbitrary monotonic non-decreasing 10-bin curves
  const monotonicCurveArb = fc
    .array(fc.integer({ min: 0, max: 10000 }), { minLength: 10, maxLength: 10 })
    .map((arr) => arr.sort((a, b) => a - b).map((val) => val / 10000));

  const linearCurve = [0.05, 0.15, 0.25, 0.35, 0.45, 0.55, 0.65, 0.75, 0.85, 0.95];

  describe('Property 1: Range Invariant & Boundary Clamping', () => {
    it('interpolateCurve always yields results in [0, 1] for arbitrary floats in [-Infinity, Infinity]', () => {
      fc.assert(
        fc.property(
          monotonicCurveArb,
          fc.float({ min: -1000, max: 1000, noNaN: true }),
          (curve, distFrac) => {
            const timeFrac = interpolateCurve(curve, distFrac);
            expect(timeFrac).toBeGreaterThanOrEqual(0);
            expect(timeFrac).toBeLessThanOrEqual(1);

            if (distFrac <= 0) expect(timeFrac).toBe(0);
            if (distFrac >= 1) expect(timeFrac).toBe(1);
          },
        ),
        { numRuns: 1000 },
      );
    });

    it('inverseCurve always yields results in [0, 1] for arbitrary floats in [-Infinity, Infinity]', () => {
      fc.assert(
        fc.property(
          monotonicCurveArb,
          fc.float({ min: -1000, max: 1000, noNaN: true }),
          (curve, timeFrac) => {
            const distFrac = inverseCurve(curve, timeFrac);
            expect(distFrac).toBeGreaterThanOrEqual(0);
            expect(distFrac).toBeLessThanOrEqual(1);

            if (timeFrac <= 0) expect(distFrac).toBe(0);
            if (timeFrac >= 1) expect(distFrac).toBe(1);
          },
        ),
        { numRuns: 1000 },
      );
    });
  });

  describe('Property 2: Monotonicity Invariants', () => {
    it('interpolateCurve is monotonic non-decreasing when curve is monotonic non-decreasing', () => {
      fc.assert(
        fc.property(
          monotonicCurveArb,
          fc.float({ min: 0, max: 1, noNaN: true }),
          fc.float({ min: 0, max: 1, noNaN: true }),
          (curve, d1, d2) => {
            const low = Math.min(d1, d2);
            const high = Math.max(d1, d2);
            expect(interpolateCurve(curve, low)).toBeLessThanOrEqual(interpolateCurve(curve, high));
          },
        ),
        { numRuns: 1000 },
      );
    });

    it('inverseCurve is monotonic non-decreasing when curve is strictly increasing', () => {
      fc.assert(
        fc.property(
          strictlyIncreasingCurveArb,
          fc.float({ min: 0, max: 1, noNaN: true }),
          fc.float({ min: 0, max: 1, noNaN: true }),
          (curve, t1, t2) => {
            const low = Math.min(t1, t2);
            const high = Math.max(t1, t2);
            expect(inverseCurve(curve, low)).toBeLessThanOrEqual(inverseCurve(curve, high));
          },
        ),
        { numRuns: 1000 },
      );
    });
  });

  describe('Property 3: Round-Trip Bijection (interpolateCurve <-> inverseCurve)', () => {
    it('inverseCurve(interpolateCurve(d)) recovers distance fraction d for any strictly increasing curve', () => {
      fc.assert(
        fc.property(
          strictlyIncreasingCurveArb,
          fc.float({ min: 0, max: 1, noNaN: true }),
          (curve, d) => {
            const interpolatedTime = interpolateCurve(curve, d);
            const reconstructedDist = inverseCurve(curve, interpolatedTime);
            expect(reconstructedDist).toBeCloseTo(d, 4);
          },
        ),
        { numRuns: 1000 },
      );
    });

    it('interpolateCurve(inverseCurve(t)) recovers time fraction t for any strictly increasing curve', () => {
      fc.assert(
        fc.property(
          strictlyIncreasingCurveArb,
          fc.float({ min: 0, max: 1, noNaN: true }),
          (curve, t) => {
            const invertedDist = inverseCurve(curve, t);
            const reconstructedTime = interpolateCurve(curve, invertedDist);
            expect(reconstructedTime).toBeCloseTo(t, 4);
          },
        ),
        { numRuns: 1000 },
      );
    });
  });

  describe('Property 4: Linear Curve Identity Property', () => {
    it('linear constant-speed curve acts as an identity function across [0, 1]', () => {
      fc.assert(
        fc.property(fc.float({ min: 0, max: 1, noNaN: true }), (x) => {
          expect(interpolateCurve(linearCurve, x)).toBeCloseTo(x, 5);
          expect(inverseCurve(linearCurve, x)).toBeCloseTo(x, 5);
        }),
        { numRuns: 500 },
      );
    });
  });

  describe('Property 5: DST-Transition Invariance of estimateDelay & computeDistanceBehind', () => {
    const schedule = {
      s: {
        '7001': { ids: ['70011'], lat: 37.7, lon: -122.4, n: 'Origin' },
        '7002': { ids: ['70021'], lat: 37.6, lon: -122.4, n: 'Dest' },
      },
      p: { P1: ['7001', '7002'] },
      t: [],
    } as unknown as StaticSchedule;

    const linearPerf: TripPerformance = {
      stops: {},
      legs: {
        '7001->7002': {
          medianTravelSec: 1200,
          p90TravelSec: 1400,
          medianSpeedMS: 25,
          curve: linearCurve,
        },
      },
    };

    // Independent ISO-8601 oracle with explicit post-2AM America/Los_Angeles offsets:
    // - 2026-01-15: PST (-08:00)
    // - 2026-07-15: PDT (-07:00)
    // - 2026-03-08: Spring Forward (after 03:00 AM, offset is PDT -07:00)
    // - 2026-11-01: Fall Back (after 02:00 AM, offset is PST -08:00)
    const dstScenarioArb = fc.constantFrom(
      { dateStr: '2026-01-15', postCutoffOffset: '-08:00' },
      { dateStr: '2026-07-15', postCutoffOffset: '-07:00' },
      { dateStr: '2026-03-08', postCutoffOffset: '-07:00' },
      { dateStr: '2026-11-01', postCutoffOffset: '-08:00' },
    );

    function wallMinToIsoEpochOracle(
      dateStr: string,
      offset: string,
      minutesFromMidnight: number,
    ): number {
      const totalSec = Math.round(minutesFromMidnight * 60);
      const hh = String(Math.floor(totalSec / 3600)).padStart(2, '0');
      const mm = String(Math.floor((totalSec % 3600) / 60)).padStart(2, '0');
      const ss = String(totalSec % 60).padStart(2, '0');
      return Date.parse(`${dateStr}T${hh}:${mm}:${ss}${offset}`) / 1000;
    }

    it('recovers trueDelaySec across PST, PDT, spring-forward, and fall-back days without 60-min DST skew', () => {
      fc.assert(
        fc.property(
          dstScenarioArb,
          fc.integer({ min: 180, max: 1320 }), // departMin between 03:00 and 22:00
          fc.integer({ min: 10, max: 60 }), // leg duration in minutes
          fc.integer({ min: 0, max: 7200 }), // true delay in seconds
          (scenario, departMin, durationMin, trueDelaySec) => {
            const arriveMin = departMin + durationMin;
            const trip: Trip = {
              i: '101',
              p: 'P1',
              st: [departMin, departMin, arriveMin, arriveMin],
              rt: 'Local',
              s: '7001',
              d: 0,
            };

            const scheduledArriveEpoch = wallMinToIsoEpochOracle(
              scenario.dateStr,
              scenario.postCutoffOffset,
              arriveMin,
            );
            const predictedArriveEpoch = scheduledArriveEpoch + trueDelaySec;

            // Midpoint of leg (distFrac = 0.5, timeFrac = 0.5 on linearCurve)
            const midPos = { la: 37.65, lo: -122.4 };
            const scheduledMidEpoch = wallMinToIsoEpochOracle(
              scenario.dateStr,
              scenario.postCutoffOffset,
              departMin + durationMin * 0.5,
            );
            const nowEpoch = scheduledMidEpoch + trueDelaySec;

            // 1. Predicted-time-only feed (feedDelaySec = 0, predictedTimeEpoch set)
            const feedOnly = estimateDelay(
              0,
              undefined,
              '7002',
              trip,
              schedule,
              linearPerf,
              nowEpoch,
              scenario.dateStr,
              predictedArriveEpoch,
            );
            expect(feedOnly.delaySec).toBe(trueDelaySec);

            // 2. Blended GPS + predictedTimeEpoch
            const blended = estimateDelay(
              0,
              midPos,
              '7002',
              trip,
              schedule,
              linearPerf,
              nowEpoch,
              scenario.dateStr,
              predictedArriveEpoch,
            );
            expect(Math.abs(blended.delaySec - trueDelaySec)).toBeLessThanOrEqual(2);

            // 3. When on time (trueDelaySec === 0), distance behind is ~0m
            if (trueDelaySec === 0) {
              const behind = computeDistanceBehind(
                midPos,
                '7002',
                trip,
                schedule,
                linearPerf,
                scheduledMidEpoch,
                scenario.dateStr,
              );
              expect(behind).toBeDefined();
              expect(Math.abs(behind!)).toBeLessThan(10);
            }
          },
        ),
        { numRuns: 500 },
      );
    });
  });
});
