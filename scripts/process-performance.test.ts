// SPDX-License-Identifier: MIT
// Copyright 2026 Roland Dreier <roland@rolandd.dev>

import { describe, it, expect } from 'vitest';
import {
  pavaIsotonicRegression,
  percentile,
  processTrainPerformance,
  type RawTrainSnapshot,
} from './process-performance';

describe('process-performance', () => {
  describe('pavaIsotonicRegression', () => {
    it('returns empty array for empty input', () => {
      expect(pavaIsotonicRegression([], [])).toEqual([]);
    });

    it('returns single element as-is', () => {
      expect(pavaIsotonicRegression([10], [30])).toEqual([10]);
    });

    it('preserves strictly increasing sequences', () => {
      const delays = [0, 60, 120, 180];
      const minDwells = [30, 30, 30, 30];
      const result = pavaIsotonicRegression(delays, minDwells);
      expect(result).toEqual([0, 60, 120, 180]);
    });

    it('enforces monotonic non-decreasing output when inputs decrease', () => {
      const delays = [120, 60, 180];
      const minDwells = [30, 30, 30];
      const result = pavaIsotonicRegression(delays, minDwells);

      expect(result[1]! - result[0]!).toBeGreaterThanOrEqual(30);
      expect(result[2]! - result[1]!).toBeGreaterThanOrEqual(30);
    });
  });

  describe('percentile', () => {
    it('calculates median (p50) correctly', () => {
      expect(percentile([10, 20, 30, 40, 50], 50)).toBe(30);
    });

    it('calculates p90 correctly', () => {
      const data = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
      expect(percentile(data, 90)).toBe(91);
    });
  });

  describe('processTrainPerformance', () => {
    it('aggregates train location snapshots into performance profile', () => {
      const snapshots: RawTrainSnapshot[] = [
        {
          id: 1,
          timestamp: 1774284000,
          data: JSON.stringify({
            '101': { d: 60, s: '70011', st: 2 },
          }),
        },
        {
          id: 2,
          timestamp: 1774284120,
          data: JSON.stringify({
            '101': { d: 120, s: '70021', st: 2 },
          }),
        },
      ];

      const profile = processTrainPerformance(snapshots, 90);

      expect(profile.trips['101']).toBeDefined();
      expect(profile.trips['101']?.stops['70011']).toBeDefined();
      expect(profile.trips['101']?.stops['70021']).toBeDefined();
      expect(profile.meta.windowDays).toBe(90);
    });

    it('handles partial train runs on the current day gracefully', () => {
      const snapshots: RawTrainSnapshot[] = [
        // Past day complete run
        {
          id: 1,
          timestamp: 1774197600,
          data: JSON.stringify({
            '101': { d: 60, s: '70011', st: 2 },
          }),
        },
        {
          id: 2,
          timestamp: 1774197720,
          data: JSON.stringify({
            '101': { d: 120, s: '70021', st: 2 },
          }),
        },
        // Current day partial run (only reached stop 70011 so far)
        {
          id: 3,
          timestamp: 1774284000,
          data: JSON.stringify({
            '101': { d: 90, s: '70011', st: 2 },
          }),
        },
      ];

      const profile = processTrainPerformance(snapshots, 90);

      expect(profile.trips['101']).toBeDefined();
      const stop1Delay = profile.trips['101']?.stops['70011']?.p50Delay ?? 0;
      const stop2Delay = profile.trips['101']?.stops['70021']?.p50Delay ?? 0;
      expect(stop2Delay).toBeGreaterThanOrEqual(stop1Delay);
    });

    it('calculates non-zero p90Delay across multiple trip runs and ensures p90 >= p50', () => {
      const snapshots: RawTrainSnapshot[] = [];
      const baseTime = 1774000000;

      // 10 trip runs across 10 days with delays on some runs
      for (let day = 0; day < 10; day++) {
        const dayTime = baseTime + day * 86400;
        const delaySec = day > 7 ? 300 : 60; // Delays on last 2 runs

        // Multiple 2-minute tick pings per stop
        for (let ping = 0; ping < 5; ping++) {
          snapshots.push({
            id: snapshots.length + 1,
            timestamp: dayTime + ping * 120,
            data: JSON.stringify({
              '668': { d: delaySec, s: '70261', st: 1 },
            }),
          });
        }
      }

      const profile = processTrainPerformance(snapshots, 90);
      const stopPerf = profile.trips['668']?.stops['70261'];

      expect(stopPerf).toBeDefined();
      expect(stopPerf?.p50Delay).toBeGreaterThan(0);
      expect(stopPerf?.p90Delay).toBeGreaterThan(0);
      expect(stopPerf?.p90Delay).toBeGreaterThanOrEqual(stopPerf?.p50Delay!);
    });

    it('handles missing point-in-time snapshots and gaps cleanly', () => {
      const snapshots: RawTrainSnapshot[] = [
        // Ping at origin
        {
          id: 1,
          timestamp: 1774284000,
          data: JSON.stringify({
            '101': { d: 30, s: '70011', st: 2 },
          }),
        },
        // Gap of 10 minutes (missing 2-min pings)
        {
          id: 2,
          timestamp: 1774284600,
          data: JSON.stringify({
            '101': { d: 90, s: '70031', st: 2 },
          }),
        },
      ];

      const profile = processTrainPerformance(snapshots, 90);
      expect(profile.trips['101']).toBeDefined();
      expect(profile.trips['101']?.stops['70011']).toBeDefined();
      expect(profile.trips['101']?.stops['70031']).toBeDefined();
    });
  });
});
