// SPDX-License-Identifier: MIT
// Copyright 2026 Roland Dreier <roland@rolandd.dev>

import type { StaticSchedule } from './schedule';
import type { VehiclePosition } from '@packages/types/schema';

/**
 * Calculate the Haversine distance between two points in meters.
 */
function getDistanceFromLatLonInMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371000; // Radius of the earth in m
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function deg2rad(deg: number): number {
  return deg * (Math.PI / 180);
}

/**
 * Generate a human-readable description of a train's location.
 *
 * Heuristics:
 * 1. If < 250m from a station, returns "At [Station Name]".
 * 2. Otherwise, finds the next station in the direction of travel:
 *    - Northbound (d=0): Next station to the North (higher latitude).
 *    - Southbound (d=1): Next station to the South (lower latitude).
 *    Returns "X.Y km [North/South] of [Station Name]".
 */
export function getTrainLocationDescription(
  position: VehiclePosition,
  direction: 0 | 1,
  schedule: StaticSchedule,
): string {
  const pLat = position.la;
  const pLon = position.lo;

  // 1. Check for "At station"
  // We check only stations in the order list for efficiency
  for (const stationId of schedule.o) {
    const s = schedule.s[stationId];
    if (!s) continue;
    const dist = getDistanceFromLatLonInMeters(pLat, pLon, s.lat, s.lon);
    if (dist < 250) {
      return `At ${s.n}`;
    }
  }

  // 2. Find next station based on direction
  // d=0 => Northbound => Searching for nearest station with lat > pLat
  // d=1 => Southbound => Searching for nearest station with lat < pLat

  let closestStationId: string | null = null;
  let minDiff = Infinity;

  for (const stationId of schedule.o) {
    const s = schedule.s[stationId];
    if (!s) continue;

    let diff = 0;
    if (direction === 0) {
      // Northbound: station must be north of train (lat > pLat)
      // Positive diff means station is north of train
      diff = s.lat - pLat;
    } else {
      // Southbound: station must be south of train (lat < pLat)
      // Positive diff means station is south of train
      diff = pLat - s.lat;
    }

    // We want the smallest positive lat difference
    if (diff > 0 && diff < minDiff) {
      minDiff = diff;
      closestStationId = stationId;
    }
  }

  if (closestStationId) {
    const s = schedule.s[closestStationId];
    const distMeters = getDistanceFromLatLonInMeters(pLat, pLon, s.lat, s.lon);
    // Round to nearest 0.1km
    const distKm = (distMeters / 1000).toFixed(1);

    // Direction logic for description:
    // If train is Northbound approaching a station to the North, it is South of that station.
    // If train is Southbound approaching a station to the South, it is North of that station.
    const relativeDir = direction === 0 ? 'South' : 'North';

    return `${distKm} km ${relativeDir} of ${s.n}`;
  }

  return 'In Transit';
}
