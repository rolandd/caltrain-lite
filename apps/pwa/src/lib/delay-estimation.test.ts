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
        1774255200,
      );

      expect(estimate.source).toBe('feed');
      expect(estimate.delaySec).toBe(120);
    });

    it('performs soft blending near station arrival (> 95% distance)', () => {
      const trip = schedule.t[0]!;
      const dayStart = 1774255200;
      // Position near 96% of total distance
      const nearEndPosition = { la: 37.665, lo: -122.403 };
      const now = dayStart + 495 * 60; // 495 mins from midnight

      const estimate = estimateDelay(
        60,
        nearEndPosition,
        '7002',
        trip,
        schedule,
        perf,
        now,
        dayStart,
      );

      expect(estimate.source).toBe('blended');
      expect(typeof estimate.delaySec).toBe('number');
      expect(Number.isNaN(estimate.delaySec)).toBe(false);
    });
  });

  describe('computeDistanceBehind', () => {
    const schedule = {
      s: {
        '7001': { ids: ['70011'], lat: 37.776, lon: -122.394, n: 'SF' },
        '7002': { ids: ['70021'], lat: 37.662, lon: -122.404, n: 'SSF' },
      },
      p: { P1: ['7001', '7002'] },
      t: [{ i: '101', p: 'P1', st: [null, null, null, null] }],
    } as unknown as StaticSchedule;

    it('returns undefined for trips with missing/null schedule times', () => {
      const result = computeDistanceBehind(
        { la: 37.7, lo: -122.4 },
        '7002',
        schedule.t[0]!,
        schedule,
        undefined,
        1774284000,
        1774255200,
      );

      expect(result).toBeUndefined();
    });
  });
});
