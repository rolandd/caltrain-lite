// SPDX-License-Identifier: MIT
// Copyright 2026 Roland Dreier <roland@rolandd.dev>

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { interpolateCurve, inverseCurve } from './delay-estimation';

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
});
