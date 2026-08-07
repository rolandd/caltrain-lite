// SPDX-License-Identifier: MIT
// Copyright 2026 Roland Dreier <roland@rolandd.dev>

import type { Trip, StaticSchedule, TripPerformance } from '@packages/types/schema';
import { getDistanceFromLatLonInMeters } from './location';

export interface DelayEstimate {
  /** Best estimate of current delay in seconds. */
  delaySec: number;
  /** How confident we are in this estimate. */
  confidence: 'high' | 'medium' | 'low';
  /** Which signal dominated the estimate. */
  source: 'feed' | 'position' | 'blended' | 'historical';
}

/**
 * Interpolate a 10-bin progress curve to get time fraction at a given distance fraction.
 * curve[i] = time fraction at distance fraction (i*10+5)%.
 */
export function interpolateCurve(curve: number[], distFrac: number): number {
  if (distFrac <= 0) return 0;
  if (distFrac >= 1) return 1;

  if (distFrac <= 0.05) {
    return (distFrac / 0.05) * curve[0];
  }

  if (distFrac >= 0.95) {
    return curve[9] + ((distFrac - 0.95) / 0.05) * (1.0 - curve[9]);
  }

  const idx = Math.floor((distFrac - 0.05) / 0.1);
  const lowerDist = idx * 0.1 + 0.05;
  const t = (distFrac - lowerDist) / 0.1;

  return curve[idx] + t * (curve[idx + 1] - curve[idx]);
}

function clamp(val: number, min: number, max: number): number {
  return Math.min(Math.max(val, min), max);
}

/**
 * Estimate the current delay of a train by fusing feed delay, GPS position, and historical data.
 */
export function estimateDelay(
  feedDelaySec: number,
  position: { la: number; lo: number } | undefined,
  currentStopCanonical: string | undefined,
  trip: Trip,
  schedule: StaticSchedule,
  perf: TripPerformance | undefined,
  now: number, // epoch seconds
  dayStartEpoch: number, // transit day start epoch seconds
): DelayEstimate {
  const fallback: DelayEstimate = {
    delaySec: Math.max(0, feedDelaySec),
    confidence: feedDelaySec !== 0 ? 'medium' : 'low',
    source: 'feed',
  };

  if (!currentStopCanonical || !trip.p) {
    return fallback;
  }

  const pattern = schedule.p[trip.p];
  if (!pattern) return fallback;

  const stopIdx = pattern.indexOf(currentStopCanonical);
  if (stopIdx <= 0) return fallback;

  const prevStopCanonical = pattern[stopIdx - 1];

  if (!position) return fallback;

  const prevStation = schedule.s[prevStopCanonical];
  const currentStation = schedule.s[currentStopCanonical];
  if (!prevStation || !currentStation) return fallback;

  const totalDist = getDistanceFromLatLonInMeters(
    prevStation.lat,
    prevStation.lon,
    currentStation.lat,
    currentStation.lon,
  );
  const distFromPrev = getDistanceFromLatLonInMeters(
    prevStation.lat,
    prevStation.lon,
    position.la,
    position.lo,
  );

  const distFrac = totalDist > 0 ? clamp(distFromPrev / totalDist, 0, 1) : 0;

  const legKey = `${prevStopCanonical}->${currentStopCanonical}`;
  const curve = perf?.legs?.[legKey]?.curve;

  if (!curve) return fallback;

  const timeFrac = interpolateCurve(curve, distFrac);
  const schedDepartPrevMin = trip.st[(stopIdx - 1) * 2 + 1] ?? trip.st[(stopIdx - 1) * 2];
  const schedArriveNextMin = trip.st[stopIdx * 2] ?? trip.st[stopIdx * 2 + 1];

  if (schedDepartPrevMin == null || schedArriveNextMin == null) {
    return fallback;
  }

  const equivalentScheduledTime =
    dayStartEpoch +
    (schedDepartPrevMin + timeFrac * (schedArriveNextMin - schedDepartPrevMin)) * 60;
  const positionDelaySec = now - equivalentScheduledTime;

  let feedWeight = 0.45;
  let posWeight = 0.55;

  if (distFrac < 0.05 || distFrac > 0.95) {
    feedWeight = 0.8;
    posWeight = 0.2;
  }

  const fusedDelaySec = feedWeight * feedDelaySec + posWeight * positionDelaySec;

  const diff = Math.abs(feedDelaySec - positionDelaySec);
  let confidence: 'high' | 'medium' | 'low';
  if (diff <= 120) {
    confidence = 'high';
  } else if (diff <= 300) {
    confidence = 'medium';
  } else {
    confidence = 'low';
  }

  return {
    delaySec: Math.round(fusedDelaySec),
    confidence,
    source: 'blended',
  };
}

/**
 * Inverse of interpolateCurve: given a time fraction, find the distance fraction.
 * Searches the curve for the time value and linearly interpolates.
 */
export function inverseCurve(curve: number[], timeFrac: number): number {
  if (timeFrac <= 0) return 0;
  if (timeFrac >= 1) return 1;

  // Handle region before first bin midpoint (0 to 0.05 distance)
  if (timeFrac <= curve[0]) {
    return curve[0] > 0 ? (timeFrac / curve[0]) * 0.05 : 0;
  }

  // Handle region after last bin midpoint (0.95 to 1.0 distance)
  if (timeFrac >= curve[9]) {
    return curve[9] < 1 ? 0.95 + ((timeFrac - curve[9]) / (1.0 - curve[9])) * 0.05 : 1;
  }

  // Search for the interval in the curve
  for (let i = 0; i < 9; i++) {
    if (timeFrac >= curve[i] && timeFrac <= curve[i + 1]) {
      const span = curve[i + 1] - curve[i];
      const t = span > 0 ? (timeFrac - curve[i]) / span : 0;
      return i * 0.1 + 0.05 + t * 0.1;
    }
  }

  return timeFrac; // Fallback: linear
}

/**
 * Compute how far behind schedule a train is, in meters.
 *
 * Compares the train's actual GPS position to where it "should be" on the
 * current leg based on the schedule and empirical progress curve.
 *
 * Returns a positive number if the train is behind, negative if ahead,
 * or `undefined` if we can't compute it (missing data).
 */
export function computeDistanceBehind(
  position: { la: number; lo: number },
  currentStopCanonical: string,
  trip: Trip,
  schedule: StaticSchedule,
  perf: TripPerformance | undefined,
  now: number,
  dayStartEpoch: number,
): number | undefined {
  const pattern = schedule.p[trip.p];
  if (!pattern) return undefined;

  const stopIdx = pattern.indexOf(currentStopCanonical);
  if (stopIdx <= 0) return undefined;

  const prevStopCanonical = pattern[stopIdx - 1];
  const prevStation = schedule.s[prevStopCanonical];
  const currentStation = schedule.s[currentStopCanonical];
  if (!prevStation || !currentStation) return undefined;

  const totalDist = getDistanceFromLatLonInMeters(
    prevStation.lat,
    prevStation.lon,
    currentStation.lat,
    currentStation.lon,
  );
  if (totalDist <= 0) return undefined;

  // Actual position → distance fraction
  const distFromPrev = getDistanceFromLatLonInMeters(
    prevStation.lat,
    prevStation.lon,
    position.la,
    position.lo,
  );
  const actualDistFrac = clamp(distFromPrev / totalDist, 0, 1);

  // Expected position from schedule + progress curve
  const legKey = `${prevStopCanonical}->${currentStopCanonical}`;
  const curve = perf?.legs?.[legKey]?.curve;

  const schedDepartPrevMin = trip.st[(stopIdx - 1) * 2 + 1] ?? trip.st[(stopIdx - 1) * 2];
  const schedArriveNextMin = trip.st[stopIdx * 2] ?? trip.st[stopIdx * 2 + 1];
  if (schedDepartPrevMin == null || schedArriveNextMin == null) return undefined;

  const scheduledLegDurationSec = (schedArriveNextMin - schedDepartPrevMin) * 60;
  if (scheduledLegDurationSec <= 0) return undefined;

  const scheduledDepartEpoch = dayStartEpoch + schedDepartPrevMin * 60;
  const elapsedSec = now - scheduledDepartEpoch;
  const timeFrac = clamp(elapsedSec / scheduledLegDurationSec, 0, 1);

  // Use progress curve if available, otherwise fall back to linear
  const expectedDistFrac = curve ? inverseCurve(curve, timeFrac) : timeFrac;

  return (expectedDistFrac - actualDistFrac) * totalDist;
}
