// SPDX-License-Identifier: MIT
// Copyright 2026 Roland Dreier <roland@rolandd.dev>

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { pavaIsotonicRegression, percentile, haversineDistanceMeters } from './process-performance';

describe('Property-Based Testing: Performance Algorithms (process-performance)', () => {
  describe('PAVA Isotonic Regression', () => {
    it('always produces monotonic non-decreasing output for any input sequence', () => {
      fc.assert(
        fc.property(
          fc.array(fc.integer({ min: -10000, max: 10000 }), { minLength: 0, maxLength: 100 }),
          (values) => {
            const result = pavaIsotonicRegression(values);

            // Length preservation
            expect(result).toHaveLength(values.length);

            // Monotonic non-decreasing invariant
            for (let i = 0; i < result.length - 1; i++) {
              expect(result[i]).toBeLessThanOrEqual(result[i + 1]!);
            }
          },
        ),
        { numRuns: 1000 },
      );
    });

    it('satisfies boundedness within the extremes of the input sequence', () => {
      fc.assert(
        fc.property(
          fc.array(fc.integer({ min: -10000, max: 10000 }), { minLength: 1, maxLength: 80 }),
          (values) => {
            const result = pavaIsotonicRegression(values);
            const min = Math.min(...values);
            const max = Math.max(...values);

            for (const val of result) {
              expect(val).toBeGreaterThanOrEqual(min);
              expect(val).toBeLessThanOrEqual(max);
            }
          },
        ),
        { numRuns: 500 },
      );
    });

    it('is idempotent: running PAVA twice produces the identical sequence', () => {
      fc.assert(
        fc.property(
          fc.array(fc.integer({ min: -10000, max: 10000 }), { minLength: 0, maxLength: 50 }),
          (values) => {
            const once = pavaIsotonicRegression(values);
            const twice = pavaIsotonicRegression(once);
            expect(twice).toEqual(once);
          },
        ),
        { numRuns: 500 },
      );
    });

    it('acts as an identity function on already monotonic sequences', () => {
      fc.assert(
        fc.property(
          fc.array(fc.integer({ min: -10000, max: 10000 }), { minLength: 1, maxLength: 50 }),
          (raw) => {
            const sorted = [...raw].sort((a, b) => a - b);
            const result = pavaIsotonicRegression(sorted);
            expect(result).toEqual(sorted);
          },
        ),
        { numRuns: 300 },
      );
    });

    it('preserves constant sequences exactly', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: -5000, max: 5000 }),
          fc.integer({ min: 1, max: 50 }),
          (c, len) => {
            const input = Array(len).fill(c);
            const result = pavaIsotonicRegression(input);
            expect(result).toEqual(input);
          },
        ),
        { numRuns: 200 },
      );
    });
  });

  describe('Percentile Calculation', () => {
    it('always lies between min and max of non-empty array', () => {
      fc.assert(
        fc.property(
          fc.array(fc.integer({ min: -10000, max: 10000 }), { minLength: 1, maxLength: 100 }),
          fc.integer({ min: 0, max: 100 }),
          (arr, p) => {
            const result = percentile(arr, p);
            const min = Math.min(...arr);
            const max = Math.max(...arr);

            expect(result).toBeGreaterThanOrEqual(min);
            expect(result).toBeLessThanOrEqual(max);
          },
        ),
        { numRuns: 1000 },
      );
    });

    it('is monotonic in p: percentile(arr, p1) <= percentile(arr, p2) for p1 <= p2', () => {
      fc.assert(
        fc.property(
          fc.array(fc.integer({ min: -10000, max: 10000 }), { minLength: 1, maxLength: 100 }),
          fc.integer({ min: 0, max: 100 }),
          fc.integer({ min: 0, max: 100 }),
          (arr, a, b) => {
            const p1 = Math.min(a, b);
            const p2 = Math.max(a, b);
            expect(percentile(arr, p1)).toBeLessThanOrEqual(percentile(arr, p2));
          },
        ),
        { numRuns: 500 },
      );
    });

    it('matches min at p=0 and max at p=100', () => {
      fc.assert(
        fc.property(
          fc.array(fc.integer({ min: -10000, max: 10000 }), { minLength: 1, maxLength: 100 }),
          (arr) => {
            expect(percentile(arr, 0)).toBe(Math.min(...arr));
            expect(percentile(arr, 100)).toBe(Math.max(...arr));
          },
        ),
        { numRuns: 300 },
      );
    });

    it('is permutation-invariant (shuffling input produces identical percentile)', () => {
      fc.assert(
        fc.property(
          fc.array(fc.integer({ min: -10000, max: 10000 }), { minLength: 1, maxLength: 50 }),
          fc.integer({ min: 0, max: 100 }),
          (arr, p) => {
            const shuffled = [...arr].sort(() => Math.random() - 0.5);
            expect(percentile(shuffled, p)).toBe(percentile(arr, p));
          },
        ),
        { numRuns: 300 },
      );
    });

    it('is invariant on constant arrays', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: -10000, max: 10000 }),
          fc.integer({ min: 1, max: 50 }),
          fc.integer({ min: 0, max: 100 }),
          (c, len, p) => {
            const arr = Array(len).fill(c);
            expect(percentile(arr, p)).toBe(c);
          },
        ),
        { numRuns: 200 },
      );
    });
  });

  describe('Haversine Distance (haversineDistanceMeters)', () => {
    const latArb = fc.float({ min: -85, max: 85, noNaN: true });
    const lonArb = fc.float({ min: -180, max: 180, noNaN: true });

    it('satisfies identity: distance from point to itself is 0', () => {
      fc.assert(
        fc.property(latArb, lonArb, (lat, lon) => {
          expect(haversineDistanceMeters(lat, lon, lat, lon)).toBe(0);
        }),
        { numRuns: 300 },
      );
    });

    it('satisfies symmetry: dist(A, B) === dist(B, A)', () => {
      fc.assert(
        fc.property(latArb, lonArb, latArb, lonArb, (lat1, lon1, lat2, lon2) => {
          const d1 = haversineDistanceMeters(lat1, lon1, lat2, lon2);
          const d2 = haversineDistanceMeters(lat2, lon2, lat1, lon1);
          expect(d1).toBe(d2);
        }),
        { numRuns: 500 },
      );
    });

    it('is non-negative and bounded by Earth half-circumference (~20,016 km)', () => {
      fc.assert(
        fc.property(latArb, lonArb, latArb, lonArb, (lat1, lon1, lat2, lon2) => {
          const d = haversineDistanceMeters(lat1, lon1, lat2, lon2);
          expect(d).toBeGreaterThanOrEqual(0);
          expect(d).toBeLessThanOrEqual(20016000);
        }),
        { numRuns: 500 },
      );
    });

    it('satisfies triangle inequality (dist(A, C) <= dist(A, B) + dist(B, C) + epsilon)', () => {
      fc.assert(
        fc.property(
          latArb,
          lonArb,
          latArb,
          lonArb,
          latArb,
          lonArb,
          (latA, lonA, latB, lonB, latC, lonC) => {
            const dAC = haversineDistanceMeters(latA, lonA, latC, lonC);
            const dAB = haversineDistanceMeters(latA, lonA, latB, lonB);
            const dBC = haversineDistanceMeters(latB, lonB, latC, lonC);
            // +2 accounts for integer rounding in Math.round(R * c)
            expect(dAC).toBeLessThanOrEqual(dAB + dBC + 2);
          },
        ),
        { numRuns: 500 },
      );
    });
  });
});
