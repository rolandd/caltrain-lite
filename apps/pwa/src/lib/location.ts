// SPDX-License-Identifier: MIT
// Copyright 2026 Roland Dreier <roland@rolandd.dev>

import type { StaticSchedule } from './schedule';
import type { VehiclePosition } from '@packages/types/schema';

export const METERS_PER_MILE = 1609.344;

/**
 * Convert distance in meters to miles.
 */
export function metersToMiles(meters: number): number {
  return meters / METERS_PER_MILE;
}

/**
 * Calculate the Haversine distance between two points in meters.
 */
export function getDistanceFromLatLonInMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371000; // Radius of the earth in m
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const rLat1 = lat1 * (Math.PI / 180);
  const rLat2 = lat2 * (Math.PI / 180);

  const sinDLat2 = Math.sin(dLat / 2);
  const sinDLon2 = Math.sin(dLon / 2);

  const a =
    sinDLat2 * sinDLat2 +
    Math.cos(rLat1) * Math.cos(rLat2) * sinDLon2 * sinDLon2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Orthogonally project a point (pLat, pLon) onto a line segment (lat1, lon1)->(lat2, lon2).
 * Returns the fractional progress alpha in [0, 1] along the segment.
 */
export function projectPointOntoSegment(
  pLat: number,
  pLon: number,
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): { alpha: number; distanceMeters: number } {
  const dx = lon2 - lon1;
  const dy = lat2 - lat1;
  const lenSq = dx * dx + dy * dy;

  if (lenSq === 0) {
    return {
      alpha: 0,
      distanceMeters: getDistanceFromLatLonInMeters(pLat, pLon, lat1, lon1),
    };
  }

  // Parameter t of orthogonal projection
  const t = Math.max(0, Math.min(1, ((pLon - lon1) * dx + (pLat - lat1) * dy) / lenSq));
  const projLat = lat1 + t * dy;
  const projLon = lon1 + t * dx;

  return {
    alpha: t,
    distanceMeters: getDistanceFromLatLonInMeters(pLat, pLon, projLat, projLon),
  };
}

/**
 * Generate a human-readable description of a train's location, optionally augmented with
 * continuous track segment projection.
 */
export function getTrainLocationDescription(
  position: VehiclePosition,
  direction: 0 | 1,
  schedule: StaticSchedule,
): string {
  const pLat = position.la;
  const pLon = position.lo;

  // 1. Check for "At station" (<250m)
  for (const stationId of schedule.o) {
    const s = schedule.s[stationId];
    if (!s) continue;
    const dist = getDistanceFromLatLonInMeters(pLat, pLon, s.lat, s.lon);
    if (dist < 250) {
      return `At ${s.n}`;
    }
  }

  // 2. Find next station based on direction
  let closestStationId: string | null = null;
  let minDiff = Infinity;

  for (const stationId of schedule.o) {
    const s = schedule.s[stationId];
    if (!s) continue;

    const diff = direction === 0 ? s.lat - pLat : pLat - s.lat;

    if (diff > 0 && diff < minDiff) {
      minDiff = diff;
      closestStationId = stationId;
    }
  }

  if (closestStationId) {
    const s = schedule.s[closestStationId];
    const distMeters = getDistanceFromLatLonInMeters(pLat, pLon, s.lat, s.lon);
    const distMiles = metersToMiles(distMeters).toFixed(1);
    const relativeDir = direction === 0 ? 'South' : 'North';

    return `${distMiles} mi ${relativeDir} of ${s.n}`;
  }

  return 'In Transit';
}
