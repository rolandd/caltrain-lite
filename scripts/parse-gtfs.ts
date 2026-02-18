import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import JSZip from 'jszip';
import { parse } from 'csv-parse/sync';
import type {
  StaticSchedule,
  Trip,
  CalendarEntry,
  CalendarException,
  Station,
  FareRules,
} from '../packages/types/schema.d.ts';

// ---------------------------------------------------------------------------
// CSV row types (raw GTFS)
// ---------------------------------------------------------------------------

interface GtfsStop {
  stop_id: string;
  stop_name: string;
  zone_id: string;
  location_type: string;
  parent_station: string;
  stop_lat: string;
  stop_lon: string;
}

interface GtfsRoute {
  route_id: string;
  route_short_name: string;
}

interface GtfsTrip {
  route_id: string;
  service_id: string;
  trip_id: string;
  direction_id: string;
  trip_short_name: string;
}

interface GtfsStopTime {
  trip_id: string;
  arrival_time: string;
  departure_time: string;
  stop_id: string;
  stop_sequence: string;
}

interface GtfsCalendar {
  service_id: string;
  monday: string;
  tuesday: string;
  wednesday: string;
  thursday: string;
  friday: string;
  saturday: string;
  sunday: string;
  start_date: string;
  end_date: string;
}

interface GtfsCalendarDate {
  service_id: string;
  date: string;
  exception_type: string;
}

interface GtfsFareAttribute {
  fare_id: string;
  price: string;
  currency_type: string;
}

interface GtfsFareRule {
  fare_id: string;
  origin_id: string;
  destination_id: string;
}

interface GtfsFarezoneAttribute {
  zone_id: string;
  zone_name: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseCsv<T>(content: string): T[] {
  // Handle BOM that 511.org sometimes prepends
  const cleaned = content.replace(/^\uFEFF/, '');
  return parse(cleaned, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
  }) as T[];
}

/** Convert "HH:MM:SS" to minutes from midnight. Handles times > 24:00:00. */
function timeToMinutes(time: string): number {
  const parts = time.split(':');
  if (parts.length < 2) return 0;
  const hours = parseInt(parts[0], 10);
  const minutes = parseInt(parts[1], 10);
  return hours * 60 + minutes;
}

/** Price string like "6.25" → cents integer 625 */
function priceToCents(price: string): number {
  return Math.round(parseFloat(price) * 100);
}

/** Strip redundant "Caltrain Station" from stop names, collapsing whitespace. */
function cleanStationName(name: string): string {
  return name.replace(/\s*Caltrain Station\s*/g, ' ').trim();
}

/**
 * Deduplicate stop sequences into shared patterns.
 * Returns the pattern map and updates each trip's pattern ID.
 */
function deduplicatePatterns(tripStops: Map<string, string[]>): {
  patterns: Record<string, string[]>;
  tripPatternMap: Map<string, string>;
} {
  const signatureToId = new Map<string, string>();
  const patterns: Record<string, string[]> = {};
  const tripPatternMap = new Map<string, string>();
  let patternCounter = 0;

  for (const [tripId, stops] of tripStops) {
    const sig = stops.join(',');
    let patternId = signatureToId.get(sig);
    if (!patternId) {
      patternId = `p${patternCounter++}`;
      signatureToId.set(sig, patternId);
      patterns[patternId] = stops;
    }
    tripPatternMap.set(tripId, patternId);
  }

  return { patterns, tripPatternMap };
}

// ---------------------------------------------------------------------------
// Core parser — pure function, no I/O
// ---------------------------------------------------------------------------

export async function parseGtfsZip(zipBuffer: Buffer): Promise<StaticSchedule> {
  const zip = await JSZip.loadAsync(zipBuffer);

  // Read and parse CSV files from the ZIP
  async function readCsv<T>(filename: string): Promise<T[]> {
    const file = zip.file(filename);
    if (!file) return [];
    const content = await file.async('text');
    return parseCsv<T>(content);
  }

  const [
    stops,
    routes,
    trips,
    stopTimes,
    calendar,
    calendarDates,
    fareAttrs,
    fareRules,
    farezones,
  ] = await Promise.all([
    readCsv<GtfsStop>('stops.txt'),
    readCsv<GtfsRoute>('routes.txt'),
    readCsv<GtfsTrip>('trips.txt'),
    readCsv<GtfsStopTime>('stop_times.txt'),
    readCsv<GtfsCalendar>('calendar.txt'),
    readCsv<GtfsCalendarDate>('calendar_dates.txt'),
    readCsv<GtfsFareAttribute>('fare_attributes.txt'),
    readCsv<GtfsFareRule>('fare_rules.txt'),
    readCsv<GtfsFarezoneAttribute>('farezone_attributes.txt'),
  ]);

  // ----- Build route lookup -----
  const routeMap = new Map<string, string>();
  for (const r of routes) {
    routeMap.set(r.route_id, r.route_short_name);
  }

  // ----- Build canonical stations -----
  // Stations are location_type=1 (parent stations).
  // Platform stops (location_type=0) reference their parent via parent_station.
  const stationMap: Record<string, Station> = {};

  // Index: stop_id → zone_id (for platform-level stops that have zone data)
  const stopZoneMap = new Map<string, string>();
  for (const stop of stops) {
    stopZoneMap.set(stop.stop_id, stop.zone_id);
  }

  // First pass: create station entries from parent stations
  for (const stop of stops) {
    if (stop.location_type === '1') {
      stationMap[stop.stop_id] = {
        n: cleanStationName(stop.stop_name),
        z: '', // Will be derived from child stops
        ids: [],
        lat: parseFloat(stop.stop_lat),
        lon: parseFloat(stop.stop_lon),
      };
    }
  }

  // Second pass: attach child stops to parent stations and derive zone
  for (const stop of stops) {
    if (stop.location_type === '0' && stop.parent_station) {
      const parent = stationMap[stop.parent_station];
      if (parent) {
        parent.ids.push(stop.stop_id);
        // Use the child's zone_id if the parent doesn't have one yet
        if (!parent.z && stop.zone_id) {
          parent.z = stop.zone_id;
        }
      }
    }
  }

  // Remove stations with no child stops (they're not useful)
  for (const [id, station] of Object.entries(stationMap)) {
    if (station.ids.length === 0) {
      delete stationMap[id];
    }
  }

  // Build reverse lookup: stop_id → canonical station ID
  const stopToStation = new Map<string, string>();
  for (const [stationId, station] of Object.entries(stationMap)) {
    for (const stopId of station.ids) {
      stopToStation.set(stopId, stationId);
    }
  }

  // ----- Group and sort stop_times by trip -----
  const tripStopTimes = new Map<string, GtfsStopTime[]>();
  for (const st of stopTimes) {
    let arr = tripStopTimes.get(st.trip_id);
    if (!arr) {
      arr = [];
      tripStopTimes.set(st.trip_id, arr);
    }
    arr.push(st);
  }
  // Sort by stop_sequence within each trip
  for (const times of tripStopTimes.values()) {
    times.sort((a, b) => parseInt(a.stop_sequence, 10) - parseInt(b.stop_sequence, 10));
  }

  // ----- Build trip stop sequences (using canonical station IDs) -----
  const tripStopSequences = new Map<string, string[]>();
  const tripTimesMap = new Map<string, number[]>();

  for (const [tripId, times] of tripStopTimes) {
    const stationIds: string[] = [];
    const timeValues: number[] = [];

    for (const st of times) {
      const stationId = stopToStation.get(st.stop_id);
      if (stationId) {
        stationIds.push(stationId);
        timeValues.push(timeToMinutes(st.arrival_time), timeToMinutes(st.departure_time));
      }
    }

    tripStopSequences.set(tripId, stationIds);
    tripTimesMap.set(tripId, timeValues);
  }

  // ----- Deduplicate patterns -----
  const { patterns, tripPatternMap } = deduplicatePatterns(tripStopSequences);

  // ----- Build trips -----
  const outputTrips: Trip[] = [];
  for (const t of trips) {
    const patternId = tripPatternMap.get(t.trip_id);
    const times = tripTimesMap.get(t.trip_id);
    if (!patternId || !times) continue;

    outputTrips.push({
      i: t.trip_short_name || t.trip_id,
      s: t.service_id,
      p: patternId,
      d: (parseInt(t.direction_id, 10) || 0) as 0 | 1,
      st: times,
      rt: routeMap.get(t.route_id) || t.route_id,
    });
  }

  // ----- Build service rules -----
  const calendarEntries: Record<string, CalendarEntry> = {};
  for (const cal of calendar) {
    calendarEntries[cal.service_id] = {
      days: [
        parseInt(cal.monday, 10) as 0 | 1,
        parseInt(cal.tuesday, 10) as 0 | 1,
        parseInt(cal.wednesday, 10) as 0 | 1,
        parseInt(cal.thursday, 10) as 0 | 1,
        parseInt(cal.friday, 10) as 0 | 1,
        parseInt(cal.saturday, 10) as 0 | 1,
        parseInt(cal.sunday, 10) as 0 | 1,
      ],
      start: parseInt(cal.start_date, 10),
      end: parseInt(cal.end_date, 10),
    };
  }

  const calendarExceptions: Record<string, CalendarException[]> = {};
  for (const cd of calendarDates) {
    if (!calendarExceptions[cd.service_id]) {
      calendarExceptions[cd.service_id] = [];
    }
    calendarExceptions[cd.service_id].push({
      date: parseInt(cd.date, 10),
      type: parseInt(cd.exception_type, 10) as 1 | 2,
    });
  }

  // ----- Build fare rules -----
  // Zone metadata from farezone_attributes.txt
  const zones: Record<string, { name: string }> = {};
  for (const fz of farezones) {
    zones[fz.zone_id] = { name: fz.zone_name };
  }

  // Fare lookup from fare_attributes + fare_rules
  const fareById = new Map<string, number>();
  for (const fa of fareAttrs) {
    fareById.set(fa.fare_id, priceToCents(fa.price));
  }

  const fareLookup: Record<string, number> = {};
  for (const fr of fareRules) {
    if (fr.origin_id && fr.destination_id) {
      const price = fareById.get(fr.fare_id);
      if (price !== undefined) {
        const key = `${fr.origin_id}→${fr.destination_id}`;
        fareLookup[key] = price;
      }
    }
  }

  const fareRulesOutput: FareRules = { zones, fares: fareLookup };

  // ----- Build station-pair index -----
  const pairIndex: Record<string, string[]> = {};
  for (const trip of outputTrips) {
    const patternStops = patterns[trip.p];
    if (!patternStops) continue;

    for (let i = 0; i < patternStops.length; i++) {
      for (let j = i + 1; j < patternStops.length; j++) {
        const key = `${patternStops[i]}→${patternStops[j]}`;
        if (!pairIndex[key]) {
          pairIndex[key] = [];
        }
        pairIndex[key].push(trip.i);
      }
    }
  }

  // ----- Compute metadata -----
  const versionHash = createHash('sha256').update(zipBuffer).digest('hex');
  let maxEndDate = 0;
  for (const cal of Object.values(calendarEntries)) {
    if (cal.end > maxEndDate) maxEndDate = cal.end;
  }

  return {
    m: {
      v: versionHash,
      e: maxEndDate,
      u: Math.floor(Date.now() / 1000),
    },
    p: patterns,
    t: outputTrips,
    r: {
      c: calendarEntries,
      e: calendarExceptions,
    },
    s: stationMap,
    f: fareRulesOutput,
    x: pairIndex,
  };
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

async function main() {
  const apiKey = process.env.TRANSIT_511_API_KEY;
  const inputPath = process.argv[2]; // Optional: path to local ZIP file

  let zipBuffer: Buffer;

  if (inputPath) {
    // Read from local file
    console.error(`Reading GTFS ZIP from: ${inputPath}`);
    zipBuffer = readFileSync(inputPath);
  } else if (apiKey) {
    // Fetch from 511.org
    const url = `http://api.511.org/transit/datafeeds?api_key=${apiKey}&operator_id=CT`;
    console.error('Fetching GTFS ZIP from 511.org...');
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch GTFS: ${response.status} ${response.statusText}`);
    }
    zipBuffer = Buffer.from(await response.arrayBuffer());
    console.error(`Downloaded ${zipBuffer.length} bytes`);
  } else {
    console.error('Usage: parse-gtfs.ts [path-to-gtfs.zip]');
    console.error('  Or set TRANSIT_511_API_KEY environment variable to fetch from 511.org');
    process.exit(1);
  }

  const schedule = await parseGtfsZip(zipBuffer);

  // Output to file or stdout
  const outputPath = process.argv[3];
  const json = JSON.stringify(schedule);
  if (outputPath) {
    writeFileSync(outputPath, json, 'utf-8');
    console.error(`Wrote ${json.length} bytes to ${outputPath}`);
  } else {
    process.stdout.write(json);
  }

  // Summary to stderr
  console.error(`Stations: ${Object.keys(schedule.s).length}`);
  console.error(`Trips: ${schedule.t.length}`);
  console.error(`Patterns: ${Object.keys(schedule.p).length}`);
  console.error(`Station pairs: ${Object.keys(schedule.x).length}`);
  console.error(`Fare zones: ${Object.keys(schedule.f.zones).length}`);
  console.error(`Version: ${schedule.m.v.substring(0, 12)}...`);
}

// Run main() only when executed directly (not imported)
const isMainModule = process.argv[1]?.endsWith('parse-gtfs.ts');
if (isMainModule) {
  main().catch((err) => {
    console.error('Fatal:', err);
    process.exit(1);
  });
}
