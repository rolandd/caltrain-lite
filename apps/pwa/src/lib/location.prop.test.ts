// SPDX-License-Identifier: MIT
// Copyright 2026 Roland Dreier <roland@rolandd.dev>

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  projectPointOntoSegment,
  getDistanceFromLatLonInMeters,
  metersToMiles,
  METERS_PER_MILE,
} from './location';

describe('Property-Based Testing: Track Geometry & Projection (location)', () => {
  // Realistic geographic bounds (avoiding polar singularities)
  const latArb = fc.double({ min: -85, max: 85, noNaN: true });
  const lonArb = fc.double({ min: -180, max: 180, noNaN: true });

  describe('projectPointOntoSegment', () => {
    it('always bounds alpha within [0, 1] and distanceMeters >= 0 for any coordinates', () => {
      fc.assert(
        fc.property(
          latArb, lonArb,
          latArb, lonArb,
          latArb, lonArb,
          (pLat, pLon, lat1, lon1, lat2, lon2) => {
            const { alpha, distanceMeters } = projectPointOntoSegment(
              pLat, pLon, lat1, lon1, lat2, lon2,
            );

            expect(alpha).toBeGreaterThanOrEqual(0);
            expect(alpha).toBeLessThanOrEqual(1);
            expect(distanceMeters).toBeGreaterThanOrEqual(0);
          },
        ),
        { numRuns: 1000 },
      );
    });

    it('projects endpoints to alpha=0 and alpha=1 with zero distance', () => {
      fc.assert(
        fc.property(
          latArb, lonArb,
          latArb, lonArb,
          (lat1, lon1, lat2, lon2) => {
            const startProj = projectPointOntoSegment(lat1, lon1, lat1, lon1, lat2, lon2);
            expect(startProj.alpha).toBe(0);
            expect(startProj.distanceMeters).toBeCloseTo(0, 4);

            const endProj = projectPointOntoSegment(lat2, lon2, lat1, lon1, lat2, lon2);
            const dx = lon2 - lon1;
            const dy = lat2 - lat1;
            const isDegenerate = dx * dx + dy * dy === 0;

            if (isDegenerate) {
              expect(endProj.alpha).toBe(0);
            } else {
              expect(endProj.alpha).toBeCloseTo(1, 5);
            }
            expect(endProj.distanceMeters).toBeCloseTo(0, 4);
          },
        ),
        { numRuns: 500 },
      );
    });

    it('recovers fractional progress t and near-zero distance for points generated directly on the segment', () => {
      // Use local Bay Area or mid-latitude coordinates
      const localLatArb = fc.double({ min: 36.5, max: 38.5, noNaN: true });
      const localLonArb = fc.double({ min: -123.0, max: -121.5, noNaN: true });

      fc.assert(
        fc.property(
          localLatArb, localLonArb,
          localLatArb, localLonArb,
          fc.double({ min: 0.01, max: 0.99, noNaN: true }),
          (lat1, lon1, lat2, lon2, t) => {
            // Require non-degenerate segment
            fc.pre(Math.abs(lat2 - lat1) > 0.001 || Math.abs(lon2 - lon1) > 0.001);

            const pLat = lat1 + t * (lat2 - lat1);
            const pLon = lon1 + t * (lon2 - lon1);

            const { alpha, distanceMeters } = projectPointOntoSegment(
              pLat, pLon, lat1, lon1, lat2, lon2,
            );

            expect(alpha).toBeCloseTo(t, 4);
            expect(distanceMeters).toBeCloseTo(0, 1);
          },
        ),
        { numRuns: 500 },
      );
    });

    it('clamps collinear points before start to alpha=0 and past end to alpha=1', () => {
      const localLatArb = fc.double({ min: 36.5, max: 38.5, noNaN: true });
      const localLonArb = fc.double({ min: -123.0, max: -121.5, noNaN: true });

      fc.assert(
        fc.property(
          localLatArb, localLonArb,
          localLatArb, localLonArb,
          fc.double({ min: 0.05, max: 5.0, noNaN: true }),
          (lat1, lon1, lat2, lon2, offset) => {
            fc.pre(Math.abs(lat2 - lat1) > 0.001 || Math.abs(lon2 - lon1) > 0.001);

            // Point before start (t < 0)
            const beforeLat = lat1 - offset * (lat2 - lat1);
            const beforeLon = lon1 - offset * (lon2 - lon1);
            const beforeProj = projectPointOntoSegment(beforeLat, beforeLon, lat1, lon1, lat2, lon2);
            expect(beforeProj.alpha).toBe(0);

            // Point past end (t > 1)
            const afterLat = lat2 + offset * (lat2 - lat1);
            const afterLon = lon2 + offset * (lon2 - lon1);
            const afterProj = projectPointOntoSegment(afterLat, afterLon, lat1, lon1, lat2, lon2);
            expect(afterProj.alpha).toBe(1);
          },
        ),
        { numRuns: 500 },
      );
    });

    it('gracefully handles degenerate zero-length segments without NaN', () => {
      fc.assert(
        fc.property(
          latArb, lonArb,
          latArb, lonArb,
          (pLat, pLon, lat, lon) => {
            const { alpha, distanceMeters } = projectPointOntoSegment(
              pLat, pLon, lat, lon, lat, lon,
            );
            expect(alpha).toBe(0);
            expect(Number.isNaN(distanceMeters)).toBe(false);
            expect(distanceMeters).toBeCloseTo(getDistanceFromLatLonInMeters(pLat, pLon, lat, lon), 2);
          },
        ),
        { numRuns: 300 },
      );
    });
  });

  describe('getDistanceFromLatLonInMeters', () => {
    it('satisfies identity: distance from any point to itself is 0', () => {
      fc.assert(
        fc.property(latArb, lonArb, (lat, lon) => {
          expect(getDistanceFromLatLonInMeters(lat, lon, lat, lon)).toBe(0);
        }),
        { numRuns: 300 },
      );
    });

    it('satisfies symmetry: dist(A, B) === dist(B, A)', () => {
      fc.assert(
        fc.property(
          latArb, lonArb,
          latArb, lonArb,
          (lat1, lon1, lat2, lon2) => {
            const d1 = getDistanceFromLatLonInMeters(lat1, lon1, lat2, lon2);
            const d2 = getDistanceFromLatLonInMeters(lat2, lon2, lat1, lon1);
            expect(d1).toBeCloseTo(d2, 5);
          },
        ),
        { numRuns: 500 },
      );
    });

    it('satisfies triangle inequality (dist(A, C) <= dist(A, B) + dist(B, C))', () => {
      fc.assert(
        fc.property(
          latArb, lonArb,
          latArb, lonArb,
          latArb, lonArb,
          (latA, lonA, latB, lonB, latC, lonC) => {
            const dAC = getDistanceFromLatLonInMeters(latA, lonA, latC, lonC);
            const dAB = getDistanceFromLatLonInMeters(latA, lonA, latB, lonB);
            const dBC = getDistanceFromLatLonInMeters(latB, lonB, latC, lonC);

            // Allow 0.01m (1 cm) margin for IEEE 754 floating point trig rounding across planetary scale
            expect(dAC).toBeLessThanOrEqual(dAB + dBC + 0.01);
          },
        ),
        { numRuns: 500 },
      );
    });
  });

  describe('metersToMiles', () => {
    it('is an exact linear scaling by METERS_PER_MILE', () => {
      fc.assert(
        fc.property(
          fc.double({ min: 0, max: 10000000, noNaN: true }),
          (meters) => {
            const miles = metersToMiles(meters);
            expect(miles * METERS_PER_MILE).toBeCloseTo(meters, 4);
          },
        ),
        { numRuns: 500 },
      );
    });

    it('is strictly monotonic: m1 <= m2 implies miles(m1) <= miles(m2)', () => {
      fc.assert(
        fc.property(
          fc.double({ min: 0, max: 10000000, noNaN: true }),
          fc.double({ min: 0, max: 10000000, noNaN: true }),
          (m1, m2) => {
            const low = Math.min(m1, m2);
            const high = Math.max(m1, m2);
            expect(metersToMiles(low)).toBeLessThanOrEqual(metersToMiles(high));
          },
        ),
        { numRuns: 500 },
      );
    });
  });
});
