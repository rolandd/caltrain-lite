/**
 * Schedule query logic — pure functions operating on StaticSchedule.
 *
 * Types are sourced from the generated schedule-data.json shape.
 * In the future these will come from @transit/types.
 */

// Re-derive the types we need from the schema definition.
// This avoids cross-package import issues in the SvelteKit dev context.
interface Station {
  n: string;
  z: string;
  ids: string[];
}

interface Trip {
  i: string;
  s: string;
  p: string;
  d: 0 | 1;
  st: number[];
  rt: string;
}

interface CalendarEntry {
  days: (0 | 1)[];
  start: number;
  end: number;
}

interface CalendarException {
  date: number;
  type: 1 | 2;
}

interface FareRules {
  zones: Record<string, { name: string }>;
  fares: Record<string, number>;
}

export interface StaticSchedule {
  m: { v: string; e: number; u: number };
  p: Record<string, string[]>;
  t: Trip[];
  r: { c: Record<string, CalendarEntry>; e: Record<string, CalendarException[]> };
  s: Record<string, Station>;
  f: FareRules;
  x: Record<string, string[]>;
}
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
}

/**
 * Get a sorted list of stations for the picker UI.
 */
export function getStationList(schedule: StaticSchedule): StationInfo[] {
  return Object.entries(schedule.s)
    .map(([id, station]) => ({ id, name: station.n }))
    .sort((a, b) => a.name.localeCompare(b.name));
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

    results.push({
      trainNumber: trip.i,
      routeType: trip.rt,
      departureMinutes,
      arrivalMinutes,
      departure: formatTime(departureMinutes),
      arrival: formatTime(arrivalMinutes),
      duration: formatDuration(durationMinutes),
    });
  }

  // Sort by departure time
  results.sort((a, b) => a.departureMinutes - b.departureMinutes);
  return results;
}
