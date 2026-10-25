// SPDX-License-Identifier: MIT
// Copyright 2026 Roland Dreier <roland@rolandd.dev>

import { describe, it, expect } from 'vitest';
import {
  getLocalMidnightUtcSec,
  getLocalWallTimeUtcSec,
  pavaIsotonicRegression,
  percentile,
  processTrainPerformance,
  type RawTrainSnapshot,
} from './process-performance';
import type { StaticSchedule } from '../packages/types/schema.d.ts';

describe('process-performance', () => {
  describe('pavaIsotonicRegression', () => {
    it('returns empty array for empty input', () => {
      expect(pavaIsotonicRegression([])).toEqual([]);
    });

    it('returns single element as-is', () => {
      expect(pavaIsotonicRegression([10])).toEqual([10]);
    });

    it('preserves strictly increasing sequences', () => {
      const delays = [0, 60, 120, 180];
      const result = pavaIsotonicRegression(delays);
      expect(result).toEqual([0, 60, 120, 180]);
    });

    it('enforces monotonic non-decreasing output when inputs decrease', () => {
      const delays = [120, 60, 180];
      const result = pavaIsotonicRegression(delays);

      expect(result[1]!).toBeGreaterThanOrEqual(result[0]!);
      expect(result[2]!).toBeGreaterThanOrEqual(result[1]!);
    });
  });

  describe('getLocalMidnightUtcSec', () => {
    it('resolves 08:00 UTC for local midnight during PST (winter regression)', () => {
      expect(getLocalMidnightUtcSec('2026-01-15')).toBe(Date.UTC(2026, 0, 15, 8) / 1000);
      expect(getLocalMidnightUtcSec('2026-11-02')).toBe(Date.UTC(2026, 10, 2, 8) / 1000);
    });

    it('resolves 07:00 UTC for local midnight during PDT (summer)', () => {
      expect(getLocalMidnightUtcSec('2026-07-15')).toBe(Date.UTC(2026, 6, 15, 7) / 1000);
      expect(getLocalMidnightUtcSec('2026-03-09')).toBe(Date.UTC(2026, 2, 9, 7) / 1000);
    });

    it('handles the spring DST transition day (PST until 2 AM, then PDT)', () => {
      // 2026-03-08: clocks spring forward at 2 AM; midnight is still PST.
      expect(getLocalMidnightUtcSec('2026-03-08')).toBe(Date.UTC(2026, 2, 8, 8) / 1000);
      // 2026-03-07: full PST day before the transition.
      expect(getLocalMidnightUtcSec('2026-03-07')).toBe(Date.UTC(2026, 2, 7, 8) / 1000);
    });

    it('handles the fall DST transition day (PDT until 2 AM, then PST)', () => {
      // 2026-11-01: clocks fall back at 2 AM; midnight is still PDT.
      expect(getLocalMidnightUtcSec('2026-11-01')).toBe(Date.UTC(2026, 10, 1, 7) / 1000);
      // 2026-11-02: full PST day after the transition.
      expect(getLocalMidnightUtcSec('2026-11-02')).toBe(Date.UTC(2026, 10, 2, 8) / 1000);
    });
  });

  describe('getLocalWallTimeUtcSec', () => {
    it('matches midnight + offset on ordinary days', () => {
      // Winter (PST): 03:10 local = 11:10 UTC
      expect(getLocalWallTimeUtcSec('2026-01-15', 3 * 3600 + 600)).toBe(
        Date.UTC(2026, 0, 15, 11, 10) / 1000,
      );
      // Summer (PDT): 03:10 local = 10:10 UTC
      expect(getLocalWallTimeUtcSec('2026-07-15', 3 * 3600 + 600)).toBe(
        Date.UTC(2026, 6, 15, 10, 10) / 1000,
      );
    });

    it('resolves wall times after the spring-forward transition in the new offset (PDT)', () => {
      // 2026-03-08: 02:00 PST becomes 03:00 PDT, so 03:10 local is PDT
      expect(getLocalWallTimeUtcSec('2026-03-08', 3 * 3600 + 600)).toBe(
        Date.parse('2026-03-08T03:10:00-07:00') / 1000,
      );
    });

    it('resolves wall times before the spring-forward transition in the old offset (PST)', () => {
      expect(getLocalWallTimeUtcSec('2026-03-08', 1800)).toBe(
        Date.parse('2026-03-08T00:30:00-08:00') / 1000,
      );
    });

    it('resolves wall times after the fall-back transition in the new offset (PST)', () => {
      // 2026-11-01: 02:00 PDT becomes 01:00 PST, so 03:10 local is PST
      expect(getLocalWallTimeUtcSec('2026-11-01', 3 * 3600 + 600)).toBe(
        Date.parse('2026-11-01T03:10:00-08:00') / 1000,
      );
    });

    it('picks the first occurrence for the ambiguous fall-back hour', () => {
      // 01:30 occurs twice on 2026-11-01 (PDT, then PST); resolve to the first
      expect(getLocalWallTimeUtcSec('2026-11-01', 5400)).toBe(
        Date.parse('2026-11-01T01:30:00-07:00') / 1000,
      );
    });

    it('spills GTFS times past midnight (>= 24:00) into the next calendar day across a transition', () => {
      // 2026-03-07 + 27:10 = 03:10 PDT on 2026-03-08
      expect(getLocalWallTimeUtcSec('2026-03-07', 27 * 3600 + 600)).toBe(
        Date.parse('2026-03-08T03:10:00-07:00') / 1000,
      );
      // 2026-03-08 + 24:10 = 00:10 PDT on 2026-03-09 (not 01:10)
      expect(getLocalWallTimeUtcSec('2026-03-08', 24 * 3600 + 600)).toBe(
        Date.parse('2026-03-09T00:10:00-07:00') / 1000,
      );
    });

    it('probes the previous calendar day for negative inputs across a transition', () => {
      // 2026-03-09 + (03:10 - 24:00) = 03:10 PDT on 2026-03-08
      expect(getLocalWallTimeUtcSec('2026-03-09', 3 * 3600 + 600 - 86400)).toBe(
        Date.parse('2026-03-08T03:10:00-07:00') / 1000,
      );
    });

    it('agrees with getLocalMidnightUtcSec for secSinceMidnight = 0 on transition days', () => {
      expect(getLocalWallTimeUtcSec('2026-03-08', 0)).toBe(getLocalMidnightUtcSec('2026-03-08'));
      expect(getLocalWallTimeUtcSec('2026-11-01', 0)).toBe(getLocalMidnightUtcSec('2026-11-01'));
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
    it('derives zero delay for an on-time train with only a predicted time in winter (PST)', () => {
      // Regression: the scheduled-epoch derivation once hardcoded UTC-7, which
      // inflated every winter t-based delay by one hour (3600 s).
      const schedule = {
        s: {
          '7002': { ids: ['70021'], lat: 37.662, lon: -122.404, n: 'SSF' },
        },
        // Trip 101 arrives at stop 7002 at minute 10: st[0] is the arrival
        // time for the first pattern stop (the derivation reads st[2*idx]).
        t: [{ i: '101', p: 'P1', st: [10, null] }],
        p: { P1: ['7002'] },
      } as unknown as StaticSchedule;

      // 2026-01-15 00:10 PST = 08:10 UTC, so an on-time predicted time is
      // exactly localMidnight + 600 s.
      const arrivalEpoch = getLocalMidnightUtcSec('2026-01-15') + 600;
      expect(arrivalEpoch).toBe(Date.UTC(2026, 0, 15, 8, 10) / 1000);

      const snapshots: RawTrainSnapshot[] = [
        {
          id: 1,
          timestamp: arrivalEpoch,
          data: JSON.stringify({ '101': { t: arrivalEpoch, s: '70021', st: 1 } }),
        },
      ];

      const profile = processTrainPerformance(snapshots, 90, schedule);
      expect(profile.trips['101']?.stops['70021']?.p50Delay).toBe(0);
    });

    it('derives zero delay for an on-time train with only a predicted time in summer (PDT)', () => {
      const schedule = {
        s: {
          '7002': { ids: ['70021'], lat: 37.662, lon: -122.404, n: 'SSF' },
        },
        t: [{ i: '101', p: 'P1', st: [10, null] }],
        p: { P1: ['7002'] },
      } as unknown as StaticSchedule;

      // 2026-07-15 00:10 PDT = 07:10 UTC.
      const arrivalEpoch = getLocalMidnightUtcSec('2026-07-15') + 600;
      expect(arrivalEpoch).toBe(Date.UTC(2026, 6, 15, 7, 10) / 1000);

      const snapshots: RawTrainSnapshot[] = [
        {
          id: 1,
          timestamp: arrivalEpoch,
          data: JSON.stringify({ '101': { t: arrivalEpoch, s: '70021', st: 1 } }),
        },
      ];

      const profile = processTrainPerformance(snapshots, 90, schedule);
      expect(profile.trips['101']?.stops['70021']?.p50Delay).toBe(0);
    });

    it('derives a 30-minute delay on the spring-forward day (2026-03-08, after the transition)', () => {
      // Regression: resolving the offset at local midnight placed wall times
      // after the 02:00 -> 03:00 transition an hour late, so late arrivals
      // were clamped to zero delay.
      const schedule = {
        s: {
          '7002': { ids: ['70021'], lat: 37.662, lon: -122.404, n: 'SSF' },
        },
        // Scheduled arrival 03:10 local on 2026-03-08 (minute 190).
        t: [{ i: '101', p: 'P1', st: [190, null] }],
        p: { P1: ['7002'] },
      } as unknown as StaticSchedule;

      // 03:10 PDT = 10:10 UTC; predicted arrival 30 minutes late.
      const predictedEpoch = Date.parse('2026-03-08T03:40:00-07:00') / 1000;
      const snapshots: RawTrainSnapshot[] = [
        {
          id: 1,
          timestamp: predictedEpoch,
          data: JSON.stringify({ '101': { t: predictedEpoch, s: '70021', st: 1 } }),
        },
      ];

      const profile = processTrainPerformance(snapshots, 90, schedule);
      expect(profile.trips['101']?.stops['70021']?.p50Delay).toBe(1800);
    });

    it('derives zero delay for an on-time train on the fall-back day (2026-11-01, after the transition)', () => {
      // Regression: resolving the offset at local midnight placed wall times
      // after the 02:00 -> 01:00 transition an hour early, so on-time
      // arrivals recorded a phantom 3600 s delay.
      const schedule = {
        s: {
          '7002': { ids: ['70021'], lat: 37.662, lon: -122.404, n: 'SSF' },
        },
        // Scheduled arrival 03:10 local on 2026-11-01 (minute 190).
        t: [{ i: '101', p: 'P1', st: [190, null] }],
        p: { P1: ['7002'] },
      } as unknown as StaticSchedule;

      // 03:10 PST = 11:10 UTC, exactly on time.
      const arrivalEpoch = Date.parse('2026-11-01T03:10:00-08:00') / 1000;
      const snapshots: RawTrainSnapshot[] = [
        {
          id: 1,
          timestamp: arrivalEpoch,
          data: JSON.stringify({ '101': { t: arrivalEpoch, s: '70021', st: 1 } }),
        },
      ];

      const profile = processTrainPerformance(snapshots, 90, schedule);
      expect(profile.trips['101']?.stops['70021']?.p50Delay).toBe(0);
    });

    it('derives a 30-minute delay for a next-day arrival observed before the DST transition', () => {
      // Regression: the adjacent-day candidates were built with fixed
      // 86400-second shifts, which are wrong across a transition (adjacent
      // local midnights are 23 or 25 hours apart).
      const schedule = {
        s: {
          '7002': { ids: ['70021'], lat: 37.662, lon: -122.404, n: 'SSF' },
        },
        // GTFS time 24:10 = 00:10 on the following calendar day.
        t: [{ i: '101', p: 'P1', st: [1450, null] }],
        p: { P1: ['7002'] },
      } as unknown as StaticSchedule;

      // Snapshot late on 2026-03-08; predicted arrival 00:40 PDT on 2026-03-09
      // (30 minutes late). The scheduled epoch must resolve to 00:10 PDT
      // 2026-03-09 = 07:10 UTC, not midnight+24h10m = 01:10 PDT.
      const snapshotTs = Date.parse('2026-03-08T23:50:00-07:00') / 1000;
      const predictedEpoch = Date.parse('2026-03-09T00:40:00-07:00') / 1000;
      const snapshots: RawTrainSnapshot[] = [
        {
          id: 1,
          timestamp: snapshotTs,
          data: JSON.stringify({ '101': { t: predictedEpoch, s: '70021', st: 1 } }),
        },
      ];

      const profile = processTrainPerformance(snapshots, 90, schedule);
      expect(profile.trips['101']?.stops['70021']?.p50Delay).toBe(1800);
    });

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
      expect(stopPerf!.p50Delay).toBeGreaterThan(0);
      expect(stopPerf!.p90Delay).toBeGreaterThan(0);
      expect(stopPerf!.p90Delay).toBeGreaterThanOrEqual(stopPerf!.p50Delay);
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

    it('builds empirical progress curves and interpolates missing data', () => {
      const schedule = {
        s: {
          '7001': { ids: ['70011'], lat: 37.776, lon: -122.394, n: 'SF' },
          '7002': { ids: ['70021'], lat: 37.662, lon: -122.404, n: 'SSF' },
        },
        t: [{ i: '101', p: 'P1', st: [0, null, 10, null] }],
        p: { P1: ['7001', '7002'] },
      } as unknown as StaticSchedule;

      const snapshots: RawTrainSnapshot[] = [];
      let ts = 1774284000;

      snapshots.push({
        id: 0,
        timestamp: ts,
        data: JSON.stringify({ '101': { s: '70011', st: 1 } }),
      });
      ts += 60;

      snapshots.push({
        id: 1,
        timestamp: ts,
        data: JSON.stringify({ '101': { s: '70021', st: 2, p: { la: 37.776, lo: -122.394 } } }),
      });

      for (let i = 1; i <= 22; i++) {
        ts += 30;
        const progress = i / 25;
        snapshots.push({
          id: i + 1,
          timestamp: ts,
          data: JSON.stringify({
            '101': {
              s: '70021',
              st: 2,
              p: {
                la: 37.776 + progress * (37.662 - 37.776),
                lo: -122.394 + progress * (-122.404 - -122.394),
              },
            },
          }),
        });
      }

      ts += 60;
      snapshots.push({
        id: 25,
        timestamp: ts,
        data: JSON.stringify({ '101': { s: '70031', st: 1, p: { la: 37.662, lo: -122.404 } } }),
      });

      const profile = processTrainPerformance(snapshots, 90, schedule);
      const leg = profile.trips['101']?.legs?.['7001->7002'];
      expect(leg).toBeDefined();
      expect(leg?.curve).toBeDefined();
      expect(leg!.curve!).toHaveLength(10);

      for (let i = 1; i < 10; i++) {
        expect(leg!.curve![i]!).toBeGreaterThanOrEqual(leg!.curve![i - 1]!);
      }

      for (let i = 0; i < 10; i++) {
        expect(leg!.curve![i]!).toBeGreaterThanOrEqual(0);
        expect(leg!.curve![i]!).toBeLessThanOrEqual(1);
      }
    });

    it('produces non-linear curves for non-linear speed profiles', () => {
      const schedule = {
        s: {
          '7001': { ids: ['70011'], lat: 37.7, lon: -122.4, n: 'A' },
          '7002': { ids: ['70021'], lat: 37.6, lon: -122.4, n: 'B' },
        },
        t: [{ i: '101', p: 'P1', st: [0, null, 10, null] }],
        p: { P1: ['7001', '7002'] },
      } as unknown as StaticSchedule;

      const snapshots: RawTrainSnapshot[] = [];
      let ts = 1774284000;
      snapshots.push({
        id: 0,
        timestamp: ts,
        data: JSON.stringify({ '101': { s: '70011', st: 1 } }),
      });
      ts += 60;
      snapshots.push({
        id: 1,
        timestamp: ts,
        data: JSON.stringify({ '101': { s: '70021', st: 2, p: { la: 37.7, lo: -122.4 } } }),
      });

      for (let i = 1; i <= 22; i++) {
        ts += 30;
        const progressTime = i / 25;
        const progressDist =
          progressTime < 0.8
            ? (progressTime / 0.8) * 0.2
            : 0.2 + ((progressTime - 0.8) / 0.2) * 0.8;

        snapshots.push({
          id: i + 1,
          timestamp: ts,
          data: JSON.stringify({
            '101': { s: '70021', st: 2, p: { la: 37.7 - progressDist * 0.1, lo: -122.4 } },
          }),
        });
      }

      ts += 60;
      snapshots.push({
        id: 25,
        timestamp: ts,
        data: JSON.stringify({ '101': { s: '70031', st: 1, p: { la: 37.6, lo: -122.4 } } }),
      });

      const profile = processTrainPerformance(snapshots, 90, schedule);
      const leg = profile.trips['101']?.legs?.['7001->7002'];
      expect(leg?.curve).toBeDefined();
      expect(leg!.curve![1]!).toBeGreaterThan(0.3);
    });
  });
});
