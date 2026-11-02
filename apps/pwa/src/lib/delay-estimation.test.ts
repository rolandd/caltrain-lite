// SPDX-License-Identifier: MIT
// Copyright 2026 Roland Dreier <roland@rolandd.dev>

import { describe, it, expect } from 'vitest';
import {
  interpolateCurve,
  inverseCurve,
  estimateDelay,
  computeDistanceBehind,
} from './delay-estimation';
import type { Trip, StaticSchedule, TripPerformance } from '@packages/types/schema';

describe('delay-estimation', () => {
  describe('interpolateCurve & inverseCurve', () => {
    const sampleCurve = [0.03, 0.09, 0.18, 0.3, 0.45, 0.6, 0.75, 0.87, 0.94, 0.98];

    it('interpolates boundary regions correctly', () => {
      expect(interpolateCurve(sampleCurve, 0)).toBe(0);
      expect(interpolateCurve(sampleCurve, 1)).toBe(1);
      expect(interpolateCurve(sampleCurve, 0.05)).toBeCloseTo(0.03);
      expect(interpolateCurve(sampleCurve, 0.95)).toBeCloseTo(0.98);
    });

    it('performs inverse lookup correctly', () => {
      expect(inverseCurve(sampleCurve, 0)).toBe(0);
      expect(inverseCurve(sampleCurve, 1)).toBe(1);
      expect(inverseCurve(sampleCurve, 0.03)).toBeCloseTo(0.05);
      expect(inverseCurve(sampleCurve, 0.98)).toBeCloseTo(0.95);
    });
  });

  describe('estimateDelay', () => {
    const schedule = {
      s: {
        '7001': { ids: ['70011'], lat: 37.776, lon: -122.394, n: 'SF' },
        '7002': { ids: ['70021'], lat: 37.662, lon: -122.404, n: 'SSF' },
      },
      p: { P1: ['7001', '7002'] },
      t: [
        { i: '101', p: 'P1', st: [480, 480, 500, 500] },
        { i: '102', p: 'P1', st: [null, 480, 500, null] },
        // Evening train: departs 7001 at 17:55 (1075), arrives 7002 at 18:15 (1095)
        { i: '638', p: 'P1', st: [1075, 1075, 1095, 1095] },
      ],
    } as unknown as StaticSchedule;

    const perf: TripPerformance = {
      stops: {
        '7002': { p50Delay: 60, p90Delay: 120, dwellSec: 30 },
      },
      legs: {
        '7001->7002': {
          medianTravelSec: 1200,
          p90TravelSec: 1400,
          medianSpeedMS: 25,
          curve: [0.05, 0.15, 0.25, 0.35, 0.45, 0.55, 0.65, 0.75, 0.85, 0.95],
        },
      },
    };

    it('gracefully falls back when schedule stop times contain null values', () => {
      const nullTrip: Trip = {
        i: '103',
        p: 'P1',
        st: [null, null, null, null],
        rt: 'Local',
        s: '7001',
        d: 0,
      };
      const estimate = estimateDelay(
        120,
        { la: 37.7, lo: -122.4 },
        '7002',
        nullTrip,
        schedule,
        perf,
        1774284000,
        '2026-03-23',
      );

      expect(estimate.source).toBe('feed');
      expect(estimate.delaySec).toBe(120);
    });

    it('performs soft blending near station arrival (> 95% distance)', () => {
      const trip = schedule.t[0]!;
      // Position near 96% of total distance
      const nearEndPosition = { la: 37.665, lo: -122.403 };
      // 495 mins from midnight (08:15 PDT) on 2026-03-23
      const now = Date.parse('2026-03-23T08:15:00-07:00') / 1000;

      const estimate = estimateDelay(
        60,
        nearEndPosition,
        '7002',
        trip,
        schedule,
        perf,
        now,
        '2026-03-23',
      );

      expect(estimate.source).toBe('blended');
      expect(typeof estimate.delaySec).toBe('number');
      expect(Number.isNaN(estimate.delaySec)).toBe(false);
    });

    it('does not report a phantom 60-minute delay on the fall-back DST transition day (2026-11-01)', () => {
      const trip = schedule.t[2]!; // Train 638: 17:55 -> 18:15
      // 2026-11-01 clocks fell back PDT -> PST at 2:00 AM.
      // At 18:15:12 PST (predicted arrival 12s after 18:15 schedule), train is on time.
      const predictedEpoch = Date.parse('2026-11-01T18:15:12-08:00') / 1000;
      const nowMidLeg = Date.parse('2026-11-01T18:05:12-08:00') / 1000;
      const midPosition = { la: (37.776 + 37.662) / 2, lo: (-122.394 + -122.404) / 2 };

      // 1. Feed-only (predictedTimeEpoch with feedDelaySec = 0, matching 511 GTFS-RT feed)
      const feedEstimate = estimateDelay(
        0,
        undefined,
        '7002',
        trip,
        schedule,
        perf,
        nowMidLeg,
        '2026-11-01',
        predictedEpoch,
      );
      expect(feedEstimate.source).toBe('feed');
      expect(feedEstimate.delaySec).toBe(12);

      // 2. Blended GPS + predictedTimeEpoch
      const blendedEstimate = estimateDelay(
        0,
        midPosition,
        '7002',
        trip,
        schedule,
        perf,
        nowMidLeg,
        '2026-11-01',
        predictedEpoch,
      );
      expect(blendedEstimate.source).toBe('blended');
      expect(Math.abs(blendedEstimate.delaySec - 12)).toBeLessThanOrEqual(2);
    });

    it('accurately detects a 10-minute delay on the spring-forward DST transition day (2026-03-08)', () => {
      const trip = schedule.t[2]!; // Train 638: 17:55 -> 18:15
      // 2026-03-08 clocks sprang forward PST -> PDT at 2:00 AM.
      // Scheduled arrival 18:15 PDT; predicted arrival 18:25 PDT (600s late).
      const predictedEpoch = Date.parse('2026-03-08T18:25:00-07:00') / 1000;
      const nowMidLeg = Date.parse('2026-03-08T18:15:00-07:00') / 1000; // 10 min past 18:05 midpoint
      const midPosition = { la: (37.776 + 37.662) / 2, lo: (-122.394 + -122.404) / 2 };

      const feedEstimate = estimateDelay(
        0,
        undefined,
        '7002',
        trip,
        schedule,
        perf,
        nowMidLeg,
        '2026-03-08',
        predictedEpoch,
      );
      expect(feedEstimate.delaySec).toBe(600);

      const blendedEstimate = estimateDelay(
        0,
        midPosition,
        '7002',
        trip,
        schedule,
        perf,
        nowMidLeg,
        '2026-03-08',
        predictedEpoch,
      );
      expect(blendedEstimate.source).toBe('blended');
      expect(Math.abs(blendedEstimate.delaySec - 600)).toBeLessThanOrEqual(2);
    });
  });

  describe('computeDistanceBehind', () => {
    const schedule = {
      s: {
        '7001': { ids: ['70011'], lat: 37.776, lon: -122.394, n: 'SF' },
        '7002': { ids: ['70021'], lat: 37.662, lon: -122.404, n: 'SSF' },
      },
      p: { P1: ['7001', '7002'] },
      t: [
        { i: '101', p: 'P1', st: [null, null, null, null] },
        { i: '638', p: 'P1', st: [1075, 1075, 1095, 1095] },
      ],
    } as unknown as StaticSchedule;

    it('returns undefined for trips with missing/null schedule times', () => {
      const result = computeDistanceBehind(
        { la: 37.7, lo: -122.4 },
        '7002',
        schedule.t[0]!,
        schedule,
        undefined,
        1774284000,
        '2026-03-23',
      );

      expect(result).toBeUndefined();
    });

    it('computes ~0 meters behind for an on-time train on the fall-back DST transition day (2026-11-01)', () => {
      const midPosition = { la: (37.776 + 37.662) / 2, lo: (-122.394 + -122.404) / 2 };
      const nowMidLeg = Date.parse('2026-11-01T18:05:00-08:00') / 1000;

      const behindMeters = computeDistanceBehind(
        midPosition,
        '7002',
        schedule.t[1]!,
        schedule,
        undefined,
        nowMidLeg,
        '2026-11-01',
      );

      expect(behindMeters).toBeDefined();
      expect(Math.abs(behindMeters!)).toBeLessThan(10);
    });
  });
});
