// SPDX-License-Identifier: MIT
// Copyright 2026 Roland Dreier <roland@rolandd.dev>

/**
 * Schedule query logic — pure functions operating on StaticSchedule.
 *
 * Types are sourced from the generated schedule-data.json shape.
 * In the future these will come from @transit/types.
 */

import type {
  Station,
  Trip,
  CalendarEntry,
  CalendarException,
  FareRules,
  StaticSchedule,
} from '../../../../packages/types/schema';

export type { StaticSchedule };
export interface StationInfo {
  id: string;
  name: string;
}

export interface TripResult {
  trainNumber: string;
  routeType: string;
  departureMinutes: number;
  arrivalMinutes: number;
  departure: string; // formatted "HH:MM"
  arrival: string; // formatted "HH:MM"
  duration: string; // formatted "Xh YYm" or "YYm"
  durationMinutes: number; // raw integer duration in minutes
  intermediateStops: number; // stations between origin and destination (exclusive)
  direction: 0 | 1;
}

/**
 * Get a sorted list of stations for the picker UI.
 * Uses the pre-ordered list from the schedule (North-to-South).
 */
export function getStationList(schedule: StaticSchedule): StationInfo[] {
  if (schedule.o) {
    return schedule.o.map((id) => ({ id, name: schedule.s[id]?.n || id }));
  }
  // Fallback to alphabetical if 'o' is missing
  return Object.entries(schedule.s)
    .map(([id, station]) => ({ id, name: station.n }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Normalizes a date string to the nearest valid date.
 * For example, Feb 30th becomes March 2nd (or 1st in non-leap).
 * Returns YYYY-MM-DD string.
 */
export function normalizeDate(dateStr: string): string {
  if (!dateStr) return new Date().toISOString().slice(0, 10);
  const [y, m, d] = dateStr.split('-').map((n) => parseInt(n, 10));
  // Month is 0-indexed in JS Date constructor
  const date = new Date(y, m - 1, d, 12, 0, 0);
  if (isNaN(date.getTime())) return new Date().toISOString().slice(0, 10);

  const resY = date.getFullYear();
  const resM = (date.getMonth() + 1).toString().padStart(2, '0');
  const resD = date.getDate().toString().padStart(2, '0');
  return `${resY}-${resM}-${resD}`;
}

/**
 * Format minutes-from-midnight as "HH:MM" (24h).
 */
function formatTime(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

/**
 * Format a duration in minutes as "Xh YYm" or "YYm".
 */
function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m.toString().padStart(2, '0')}m` : `${h}h`;
}

/**
 * Check whether a service ID is active on a given date.
 *
 * @param date - A Date object representing the day to check.
 */
export function isServiceActive(schedule: StaticSchedule, serviceId: string, date: Date): boolean {
  // Convert date to YYYYMMDD integer
  const y = date.getFullYear();
  const mo = date.getMonth() + 1;
  const d = date.getDate();
  const dateInt = y * 10000 + mo * 100 + d;

  // Day of week: JS getDay() → 0=Sun..6=Sat
  // Calendar days array: [mon, tue, wed, thu, fri, sat, sun]
  const jsDay = date.getDay();
  const calDayIndex = jsDay === 0 ? 6 : jsDay - 1; // Convert to Mon=0..Sun=6

  const cal = schedule.r.c[serviceId];
  let active = false;

  if (cal) {
    // Check if date is within calendar range and day-of-week is active
    if (dateInt >= cal.start && dateInt <= cal.end && cal.days[calDayIndex] === 1) {
      active = true;
    }
  }

  // Apply exceptions
  const exceptions = schedule.r.e[serviceId];
  if (exceptions) {
    for (const ex of exceptions) {
      if (ex.date === dateInt) {
        if (ex.type === 1) active = true; // service added
        if (ex.type === 2) active = false; // service removed
      }
    }
  }

  return active;
}

/**
 * Find the stop index of a station within a pattern.
 * Returns -1 if the station is not in the pattern.
 */
function findStopIndex(schedule: StaticSchedule, patternId: string, stationId: string): number {
  const stops = schedule.p[patternId];
  if (!stops) return -1;
  return stops.indexOf(stationId);
}

/**
 * Query trips between two stations on a given date.
 * Returns results sorted by departure time.
 */
export function queryTrips(
  schedule: StaticSchedule,
  originId: string,
  destinationId: string,
  date: Date,
): TripResult[] {
  // Use the pair index for O(1) candidate lookup
  const pairKey = `${originId}→${destinationId}`;
  const candidateIds = schedule.x[pairKey];
  if (!candidateIds) return [];

  // Build a quick trip lookup by train number
  const tripById = new Map<string, Trip>();
  for (const trip of schedule.t) {
    tripById.set(trip.i, trip);
  }

  const results: TripResult[] = [];

  for (const trainId of candidateIds) {
    const trip = tripById.get(trainId);
    if (!trip) continue;

    // Check if this trip runs on the given date
    if (!isServiceActive(schedule, trip.s, date)) continue;

    // Find origin and destination indices in the pattern
    const originIdx = findStopIndex(schedule, trip.p, originId);
    const destIdx = findStopIndex(schedule, trip.p, destinationId);
    if (originIdx === -1 || destIdx === -1 || originIdx >= destIdx) continue;

    // Extract times: st is interleaved [arr0, dep0, arr1, dep1, ...]
    const departureMinutes = trip.st[originIdx * 2 + 1]; // departure from origin
    const arrivalMinutes = trip.st[destIdx * 2]; // arrival at destination
    const durationMinutes = arrivalMinutes - departureMinutes;
    // Intermediate stops: stations in the pattern between origin and destination (exclusive).
    // Express/limited patterns have fewer stops than local, so this naturally reflects skipped stations.
    const intermediateStops = destIdx - originIdx - 1;

    results.push({
      trainNumber: trip.i,
      routeType: trip.rt,
      departureMinutes,
      arrivalMinutes,
      departure: formatTime(departureMinutes),
      arrival: formatTime(arrivalMinutes),
      duration: formatDuration(durationMinutes),
      durationMinutes,
      intermediateStops,
      direction: trip.d,
    });
  }

  // Sort by departure time
  results.sort((a, b) => a.departureMinutes - b.departureMinutes);
  return results;
}

/**
 * Calculate fare between two stations.
 * Uses the pre-computed zone-pair matrix.
 */
export function calculateFare(
  schedule: StaticSchedule,
  originId: string,
  destId: string,
): number | null {
  const originZone = schedule.s[originId]?.z;
  const destZone = schedule.s[destId]?.z;

  if (!originZone || !destZone) return null;

  const key = `${originZone}→${destZone}`;
  return schedule.f.fares[key] || null;
}
