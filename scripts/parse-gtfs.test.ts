import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import JSZip from 'jszip';
import { parseGtfsZip } from './parse-gtfs.ts';

// ---------------------------------------------------------------------------
// Helper: build a minimal GTFS ZIP from CSV strings
// ---------------------------------------------------------------------------

async function buildGtfsZip(files: Record<string, string>): Promise<Buffer> {
  const zip = new JSZip();
  for (const [name, content] of Object.entries(files)) {
    zip.file(name, content);
  }
  const buf = await zip.generateAsync({ type: 'nodebuffer' });
  return buf;
}

// Minimal valid GTFS CSV content templates
const AGENCY = `agency_id,agency_name,agency_url,agency_timezone
CT,Caltrain,https://caltrain.com,America/Los_Angeles`;

const ROUTES = `route_id,agency_id,route_short_name,route_long_name,route_desc,route_type
Local,CT,Local,,,2`;

const STOPS_MINIMAL = `stop_id,stop_code,stop_name,stop_lat,stop_lon,zone_id,location_type,parent_station
station_a,station_a,Station A,37.7,-122.4,Z1,1,
stop_a1,stop_a1,Station A NB,37.7,-122.4,Z1,0,station_a
stop_a2,stop_a2,Station A SB,37.7,-122.4,Z1,0,station_a
station_b,station_b,Station B,37.5,-122.2,Z2,1,
stop_b1,stop_b1,Station B NB,37.5,-122.2,Z2,0,station_b
stop_b2,stop_b2,Station B SB,37.5,-122.2,Z2,0,station_b`;

const TRIPS_MINIMAL = `route_id,service_id,trip_id,trip_headsign,direction_id,trip_short_name
Local,svc1,trip1,Station A,0,101`;

const STOP_TIMES_MINIMAL = `trip_id,arrival_time,departure_time,stop_id,stop_sequence
trip1,8:00:00,8:01:00,stop_b1,1
trip1,8:30:00,8:30:00,stop_a1,2`;

const CALENDAR_MINIMAL = `service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date
svc1,1,1,1,1,1,0,0,20260101,20261231`;

const FARE_ATTRS_MINIMAL = `fare_id,price,currency_type,payment_method,transfers,transfer_duration
fare1,4.00,USD,1,,14400`;

const FARE_RULES_MINIMAL = `fare_id,route_id,origin_id,destination_id,contains_id
fare1,,Z1,Z2,
fare1,,Z2,Z1,`;

const FAREZONE_ATTRS_MINIMAL = `zone_id,zone_name
Z1,Zone 1-North
Z2,Zone 2-South`;

// ---------------------------------------------------------------------------
// Synthetic ZIP tests (1-5)
// ---------------------------------------------------------------------------

describe('parseGtfsZip – synthetic data', () => {
  it('1: parses a minimal valid feed correctly', async () => {
    const zipBuf = await buildGtfsZip({
      'agency.txt': AGENCY,
      'routes.txt': ROUTES,
      'stops.txt': STOPS_MINIMAL,
      'trips.txt': TRIPS_MINIMAL,
      'stop_times.txt': STOP_TIMES_MINIMAL,
      'calendar.txt': CALENDAR_MINIMAL,
      'fare_attributes.txt': FARE_ATTRS_MINIMAL,
      'fare_rules.txt': FARE_RULES_MINIMAL,
      'farezone_attributes.txt': FAREZONE_ATTRS_MINIMAL,
    });

    const result = await parseGtfsZip(zipBuf);

    // -- Metadata --
    const expectedHash = createHash('sha256').update(zipBuf).digest('hex');
    expect(result.m.v).toBe(expectedHash);
    expect(result.m.e).toBe(20261231);
    expect(result.m.u).toBeGreaterThan(0);

    // -- Stations --
    expect(Object.keys(result.s)).toHaveLength(2);
    expect(result.s['station_a']).toBeDefined();
    expect(result.s['station_a'].n).toBe('Station A');
    expect(result.s['station_a'].z).toBe('Z1');
    expect(result.s['station_a'].ids).toContain('stop_a1');
    expect(result.s['station_a'].ids).toContain('stop_a2');
    expect(result.s['station_b'].z).toBe('Z2');

    // -- Trips --
    expect(result.t).toHaveLength(1);
    const trip = result.t[0];
    expect(trip.i).toBe('101'); // trip_short_name
    expect(trip.s).toBe('svc1');
    expect(trip.d).toBe(0); // Northbound
    expect(trip.rt).toBe('Local');

    // -- Stop times (interleaved arr/dep) --
    // stop_b1: arr=8:00=480, dep=8:01=481
    // stop_a1: arr=8:30=510, dep=8:30=510
    expect(trip.st).toEqual([480, 481, 510, 510]);

    // -- Pattern --
    expect(Object.keys(result.p)).toHaveLength(1);
    const patternStops = result.p[trip.p];
    expect(patternStops).toEqual(['station_b', 'station_a']);

    // -- Station-pair index --
    expect(result.x['station_b→station_a']).toContain('101');

    // -- Calendar --
    expect(result.r.c['svc1']).toBeDefined();
    expect(result.r.c['svc1'].days).toEqual([1, 1, 1, 1, 1, 0, 0]);

    // -- Fares --
    expect(result.f.zones['Z1']).toEqual({ name: 'Zone 1-North' });
    expect(result.f.fares['Z1→Z2']).toBe(400);
    expect(result.f.fares['Z2→Z1']).toBe(400);
  });

  it('2: parses calendar exceptions', async () => {
    const calDates = `service_id,date,exception_type
svc1,20260704,2
svc1,20260705,1
svc2,20260704,1`;

    const zipBuf = await buildGtfsZip({
      'agency.txt': AGENCY,
      'routes.txt': ROUTES,
      'stops.txt': STOPS_MINIMAL,
      'trips.txt': TRIPS_MINIMAL,
      'stop_times.txt': STOP_TIMES_MINIMAL,
      'calendar.txt': CALENDAR_MINIMAL,
      'calendar_dates.txt': calDates,
    });

    const result = await parseGtfsZip(zipBuf);

    expect(result.r.e['svc1']).toHaveLength(2);
    expect(result.r.e['svc1']).toContainEqual({ date: 20260704, type: 2 });
    expect(result.r.e['svc1']).toContainEqual({ date: 20260705, type: 1 });
    expect(result.r.e['svc2']).toHaveLength(1);
    expect(result.r.e['svc2'][0]).toEqual({ date: 20260704, type: 1 });
  });

  it('3: deduplicates multiple patterns', async () => {
    // Trip 1 stops at A→B, Trip 2 stops at B→A (different pattern)
    const trips = `route_id,service_id,trip_id,trip_headsign,direction_id,trip_short_name
Local,svc1,trip1,B,1,201
Local,svc1,trip2,A,0,202`;

    const stopTimes = `trip_id,arrival_time,departure_time,stop_id,stop_sequence
trip1,9:00:00,9:00:00,stop_a1,1
trip1,9:30:00,9:30:00,stop_b1,2
trip2,10:00:00,10:00:00,stop_b1,1
trip2,10:30:00,10:30:00,stop_a1,2`;

    const zipBuf = await buildGtfsZip({
      'agency.txt': AGENCY,
      'routes.txt': ROUTES,
      'stops.txt': STOPS_MINIMAL,
      'trips.txt': trips,
      'stop_times.txt': stopTimes,
      'calendar.txt': CALENDAR_MINIMAL,
    });

    const result = await parseGtfsZip(zipBuf);

    expect(result.t).toHaveLength(2);
    expect(Object.keys(result.p)).toHaveLength(2);

    // The two trips should have different pattern IDs
    const patternIds = result.t.map((t) => t.p);
    expect(new Set(patternIds).size).toBe(2);

    // One pattern is [station_a, station_b], the other [station_b, station_a]
    const allPatterns = Object.values(result.p);
    expect(allPatterns).toContainEqual(['station_a', 'station_b']);
    expect(allPatterns).toContainEqual(['station_b', 'station_a']);
  });

  it('4: converts times past midnight correctly', async () => {
    const stopTimes = `trip_id,arrival_time,departure_time,stop_id,stop_sequence
trip1,25:30:00,25:31:00,stop_b1,1
trip1,26:00:00,26:00:00,stop_a1,2`;

    const zipBuf = await buildGtfsZip({
      'agency.txt': AGENCY,
      'routes.txt': ROUTES,
      'stops.txt': STOPS_MINIMAL,
      'trips.txt': TRIPS_MINIMAL,
      'stop_times.txt': stopTimes,
      'calendar.txt': CALENDAR_MINIMAL,
    });

    const result = await parseGtfsZip(zipBuf);
    expect(result.t).toHaveLength(1);
    // 25:30 = 25*60+30 = 1530, 25:31 = 1531, 26:00 = 1560
    expect(result.t[0].st).toEqual([1530, 1531, 1560, 1560]);
  });

  it('5: handles missing fare files gracefully', async () => {
    const zipBuf = await buildGtfsZip({
      'agency.txt': AGENCY,
      'routes.txt': ROUTES,
      'stops.txt': STOPS_MINIMAL,
      'trips.txt': TRIPS_MINIMAL,
      'stop_times.txt': STOP_TIMES_MINIMAL,
      'calendar.txt': CALENDAR_MINIMAL,
      // No fare files at all
    });

    const result = await parseGtfsZip(zipBuf);

    // Should still work; fares just empty
    expect(result.f.zones).toEqual({});
    expect(result.f.fares).toEqual({});
    // Everything else should still parse
    expect(result.t).toHaveLength(1);
    expect(Object.keys(result.s)).toHaveLength(2);
  });

  it('6: strips "Caltrain Station" from station names', async () => {
    const stopsWithCaltrainStation = `stop_id,stop_code,stop_name,stop_lat,stop_lon,zone_id,location_type,parent_station
station_a,station_a,San Bruno Caltrain Station,37.7,-122.4,Z1,1,
stop_a1,stop_a1,San Bruno NB,37.7,-122.4,Z1,0,station_a
station_b,station_b,Bayshore Caltrain Station Northbound,37.5,-122.2,Z2,1,
stop_b1,stop_b1,Bayshore NB,37.5,-122.2,Z2,0,station_b`;

    const zipBuf = await buildGtfsZip({
      'agency.txt': AGENCY,
      'routes.txt': ROUTES,
      'stops.txt': stopsWithCaltrainStation,
      'trips.txt': TRIPS_MINIMAL,
      'stop_times.txt': STOP_TIMES_MINIMAL,
      'calendar.txt': CALENDAR_MINIMAL,
    });

    const result = await parseGtfsZip(zipBuf);

    // "San Bruno Caltrain Station" → "San Bruno" (no trailing space)
    expect(result.s['station_a'].n).toBe('San Bruno');
    // "Bayshore Caltrain Station Northbound" → "Bayshore Northbound" (mid-string)
    expect(result.s['station_b'].n).toBe('Bayshore Northbound');
  });
});

// ---------------------------------------------------------------------------
// Real GTFS fixture tests (6-10)
// ---------------------------------------------------------------------------

const FIXTURE_PATH = resolve(import.meta.dirname!, 'fixtures/caltrain-gtfs.zip');
let fixtureResult: Awaited<ReturnType<typeof parseGtfsZip>> | null = null;

async function getFixtureResult() {
  if (!fixtureResult) {
    const zipBuf = readFileSync(FIXTURE_PATH);
    fixtureResult = await parseGtfsZip(zipBuf);
  }
  return fixtureResult;
}

describe('parseGtfsZip – real Caltrain fixture', () => {
  it('6: produces a reasonable number of stations', async () => {
    const result = await getFixtureResult();
    const stationCount = Object.keys(result.s).length;
    // Caltrain has ~30 stations
    expect(stationCount).toBeGreaterThanOrEqual(20);
    expect(stationCount).toBeLessThanOrEqual(40);
  });

  it('7: produces a nonzero number of trips', async () => {
    const result = await getFixtureResult();
    expect(result.t.length).toBeGreaterThan(0);
  });

  it('8: contains known station "San Francisco"', async () => {
    const result = await getFixtureResult();
    const sfStation = Object.values(result.s).find((s) =>
      s.n.toLowerCase().includes('san francisco'),
    );
    expect(sfStation).toBeDefined();
    expect(sfStation!.ids.length).toBeGreaterThan(0);
    expect(sfStation!.z).toBeTruthy();
  });

  it('9: pair index covers every trip origin→destination', async () => {
    const result = await getFixtureResult();

    for (const trip of result.t) {
      const patternStops = result.p[trip.p];
      expect(patternStops).toBeDefined();
      if (patternStops.length >= 2) {
        const origin = patternStops[0];
        const dest = patternStops[patternStops.length - 1];
        const key = `${origin}→${dest}`;
        expect(result.x[key]).toBeDefined();
        expect(result.x[key]).toContain(trip.i);
      }
    }
  });

  it('10: every trip ID in pair index exists in trips', async () => {
    const result = await getFixtureResult();
    const tripIds = new Set(result.t.map((t) => t.i));

    for (const ids of Object.values(result.x)) {
      for (const id of ids) {
        expect(tripIds.has(id)).toBe(true);
      }
    }
  });
});
