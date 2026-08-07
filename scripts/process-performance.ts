// SPDX-License-Identifier: MIT
// Copyright 2026 Roland Dreier <roland@rolandd.dev>

import { readdirSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import type {
  StaticSchedule,
  TrainPerformanceProfile,
  TripPerformance,
  StopPerformance,
  LegPerformance,
  RealtimeTripStatus,
} from '../packages/types/schema.d.ts';

export interface RawTrainSnapshot {
  id: number;
  timestamp: number;
  data: string; // JSON string of Record<string, RealtimeTripStatus>
}

// Cache formatter to avoid repeated instantiations in snapshot loops
const pstDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Los_Angeles',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/**
 * Combine and deduplicate snapshot lists by timestamp.
 */
export function mergeSnapshots(...snapshotLists: RawTrainSnapshot[][]): RawTrainSnapshot[] {
  const map = new Map<number, RawTrainSnapshot>();
  for (const list of snapshotLists) {
    for (const item of list) {
      if (item && typeof item.timestamp === 'number') {
        map.set(item.timestamp, item);
      }
    }
  }
  return Array.from(map.values()).sort((a, b) => a.timestamp - b.timestamp);
}

/**
 * Get the timestamp cutoff to export from D1 based on the latest archived file in history.
 * - If no history exists yet, returns 0 (export all available D1 records for initial bootstrap).
 * - If history exists, returns (latest_archived_date - 1 day) timestamp.
 */
export function getLatestArchivedTimestamp(historyDir: string): number {
  if (!existsSync(historyDir)) return 0;

  let latestDateStr: string | null = null;
  const yearDirs = readdirSync(historyDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

  for (const year of yearDirs) {
    const yearPath = join(historyDir, year);
    const files = readdirSync(yearPath)
      .filter((f) => f.endsWith('.json.zst') || f.endsWith('.json.gz'))
      .map((f) => f.replace(/\.json\.(zst|gz)$/, ''))
      .sort();
    if (files.length > 0) {
      latestDateStr = files[files.length - 1]!;
    }
  }

  if (!latestDateStr) return 0;

  const [y, m, d] = latestDateStr.split('-').map((v) => parseInt(v, 10));
  if (!y || !m || !d) return 0;

  const latestDateMs = Date.UTC(y, m - 1, d, 0, 0, 0) - 86400 * 1000;
  return Math.max(0, Math.floor(latestDateMs / 1000));
}

/**
 * Decompress file content from .json.zst or .json.gz.
 */
function decompressFile(filePath: string): string {
  if (filePath.endsWith('.json.zst')) {
    return execFileSync('zstd', ['-d', '-c', filePath], { encoding: 'utf8' });
  }
  const compressed = readFileSync(filePath);
  return gunzipSync(compressed).toString('utf8');
}

/**
 * Load archived daily raw snapshots from data/history directory for the rolling window.
 */
export function loadArchivedSnapshots(historyDir: string, windowDays = 90): RawTrainSnapshot[] {
  if (!existsSync(historyDir)) return [];

  const nowSec = Math.floor(Date.now() / 1000);
  const cutoffSec = nowSec - windowDays * 86400;
  const snapshots: RawTrainSnapshot[] = [];

  const yearDirs = readdirSync(historyDir, { withFileTypes: true })
    .filter((dirent) => dirent.isDirectory())
    .map((dirent) => dirent.name);

  for (const year of yearDirs) {
    const yearPath = join(historyDir, year);
    const files = readdirSync(yearPath).filter(
      (f) => f.endsWith('.json.zst') || f.endsWith('.json.gz'),
    );

    for (const file of files) {
      const filePath = join(yearPath, file);
      try {
        const decompressed = decompressFile(filePath);
        const lines = decompressed.split('\n').filter((l) => l.trim().length > 0);

        for (const line of lines) {
          const row = JSON.parse(line) as RawTrainSnapshot;
          if (row.timestamp >= cutoffSec) {
            snapshots.push(row);
          }
        }
      } catch (err) {
        console.warn(`Failed to read archive file ${filePath}:`, err);
      }
    }
  }

  return snapshots;
}

/**
 * Archive completed past dates to data/history in Zstandard format (.json.zst).
 */
export function archiveCompletedDays(snapshots: RawTrainSnapshot[], historyDir: string): number {
  const pstDateStr = pstDateFormatter.format(new Date());

  const byDate: Record<string, RawTrainSnapshot[]> = {};
  for (const s of snapshots) {
    const d = pstDateFormatter.format(s.timestamp * 1000);

    if (d >= pstDateStr) continue;

    if (!byDate[d]) byDate[d] = [];
    byDate[d]!.push(s);
  }

  let updatedCount = 0;
  for (const [dateStr, rows] of Object.entries(byDate)) {
    const year = dateStr.split('-')[0]!;
    const dir = join(historyDir, year);
    const target = join(dir, `${dateStr}.json.zst`);

    let existingLineCount = 0;
    if (existsSync(target)) {
      try {
        const existing = decompressFile(target);
        existingLineCount = existing.split('\n').filter((l) => l.trim().length > 0).length;
      } catch {
        existingLineCount = 0;
      }
    }

    if (!existsSync(target) || rows.length > existingLineCount) {
      mkdirSync(dir, { recursive: true });
      const content = rows.map((r) => JSON.stringify(r)).join('\n');
      execFileSync('zstd', ['-19', '-f', '-o', target], { input: content });
      updatedCount++;
      console.log(
        `Archived ${rows.length} rows for ${dateStr} -> ${target} (was ${existingLineCount} rows)`,
      );
    }
  }

  return updatedCount;
}

/**
 * Pool Adjacent Violators Algorithm (PAVA) for Isotonic Regression.
 * Enforces non-decreasing arrival delays across consecutive stops (y[i+1] >= y[i]).
 *
 * @param values Input sequence of arrival delay values in seconds
 */
export function pavaIsotonicRegression(values: number[]): number[] {
  if (values.length === 0) return [];
  if (values.length === 1) return [...values];

  interface Block {
    sum: number;
    weight: number;
    start: number;
    end: number;
  }

  const blocks: Block[] = values.map((val, idx) => ({
    sum: val,
    weight: 1,
    start: idx,
    end: idx,
  }));

  let i = 0;
  while (i < blocks.length - 1) {
    const current = blocks[i]!;
    const next = blocks[i + 1]!;

    const currentVal = current.sum / current.weight;
    const nextVal = next.sum / next.weight;

    if (currentVal > nextVal) {
      current.sum += next.sum;
      current.weight += next.weight;
      current.end = next.end;
      blocks.splice(i + 1, 1);
      if (i > 0) i--;
    } else {
      i++;
    }
  }

  const result = new Array<number>(values.length);
  for (const block of blocks) {
    const blockVal = Math.round(block.sum / block.weight);
    for (let idx = block.start; idx <= block.end; idx++) {
      result[idx] = blockVal;
    }
  }

  return result;
}

/** Calculate percentile (0 to 100) from an array of numbers. */
export function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const index = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index - lower;
  return Math.round(sorted[lower]! * (1 - weight) + sorted[upper]! * weight);
}

/** Calculate Haversine distance in meters between two lat/lon points. */
export function haversineDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

/**
 * Process a series of raw D1 train location snapshots into a TrainPerformanceProfile object.
 */
export function processTrainPerformance(
  snapshots: RawTrainSnapshot[],
  windowDays = 90,
  schedule?: StaticSchedule,
): TrainPerformanceProfile {
  const runStopDelays: Record<string, Record<string, Record<string, number>>> = {};
  const tripStopDwells: Record<string, Record<string, number[]>> = {};
  const tripLegTravelSec: Record<string, Record<string, number[]>> = {};
  const tripLegProgressObs: Record<
    string,
    Record<string, Array<{ distFrac: number; timeFrac: number }>>
  > = {};

  const trainActiveLeg: Record<
    string,
    {
      fromStop: string;
      departTs: number;
      obs: Array<{ ts: number; lat: number; lon: number }>;
    }
  > = {};

  const stopIdToCanonical: Record<string, string> = {};
  const schedLookup: Record<string, Record<string, number>> = {};
  if (schedule) {
    for (const [canonicalId, station] of Object.entries(schedule.s)) {
      stopIdToCanonical[canonicalId] = canonicalId;
      for (const gtfsId of station.ids) {
        stopIdToCanonical[gtfsId] = canonicalId;
      }
    }

    for (const trip of schedule.t) {
      const trainNum = trip.i;
      const patternStops = schedule.p[trip.p] || [];
      if (!schedLookup[trainNum]) schedLookup[trainNum] = {};

      patternStops.forEach((canonicalStopId, idx) => {
        const arrMin = trip.st[2 * idx];
        if (typeof arrMin === 'number') {
          const sec = arrMin * 60;
          schedLookup[trainNum]![canonicalStopId] = sec;
        }
      });
    }
  }

  const getCanon = (id: string) =>
    stopIdToCanonical[id] ?? stopIdToCanonical[id.slice(0, 4)] ?? id.slice(0, 4);

  const prevTrainState: Record<
    string,
    { timestamp: number; stopId?: string; status?: number; lat?: number; lon?: number }
  > = {};

  for (const snapshot of snapshots) {
    let byTrip: Record<string, RealtimeTripStatus>;
    try {
      byTrip = JSON.parse(snapshot.data);
    } catch {
      continue;
    }

    const dateStr = pstDateFormatter.format(snapshot.timestamp * 1000);

    for (const [trainNum, status] of Object.entries(byTrip)) {
      if (!runStopDelays[trainNum]) runStopDelays[trainNum] = {};
      if (!tripStopDwells[trainNum]) tripStopDwells[trainNum] = {};
      if (!tripLegTravelSec[trainNum]) tripLegTravelSec[trainNum] = {};
      if (!tripLegProgressObs[trainNum]) tripLegProgressObs[trainNum] = {};

      const stopId = status.s;
      let delaySec = status.d ?? 0;

      if (delaySec === 0 && status.t && stopId && schedule) {
        const canonicalStop = stopIdToCanonical[stopId] ?? stopIdToCanonical[stopId.slice(0, 4)];
        const schedSec = canonicalStop ? schedLookup[trainNum]?.[canonicalStop] : undefined;
        if (typeof schedSec === 'number') {
          const [y, m, d] = dateStr.split('-').map(Number);
          const localMidnightUtcSec = Math.floor(Date.UTC(y!, m! - 1, d!) / 1000) + 7 * 3600;
          let schedEpoch = localMidnightUtcSec + schedSec;

          if (Math.abs(status.t - (schedEpoch + 86400)) < Math.abs(status.t - schedEpoch)) {
            schedEpoch += 86400;
          } else if (Math.abs(status.t - (schedEpoch - 86400)) < Math.abs(status.t - schedEpoch)) {
            schedEpoch -= 86400;
          }

          delaySec = Math.max(0, status.t - schedEpoch);
        }
      }

      const runKey = `${dateStr}:${trainNum}`;

      if (stopId) {
        if (!runStopDelays[trainNum]![stopId]) {
          runStopDelays[trainNum]![stopId] = {};
        }
        const existing = runStopDelays[trainNum]![stopId]![runKey] ?? 0;
        runStopDelays[trainNum]![stopId]![runKey] = Math.max(existing, delaySec);
      }

      const prev = prevTrainState[trainNum];
      if (prev && stopId && prev.stopId) {
        const timeDiff = snapshot.timestamp - prev.timestamp;

        const prevCanon = getCanon(prev.stopId);
        const currCanon = getCanon(stopId);

        if (stopId === prev.stopId && (status.st === 1 || status.st === 0)) {
          if (!tripStopDwells[trainNum]![stopId]) {
            tripStopDwells[trainNum]![stopId] = [];
          }
          tripStopDwells[trainNum]![stopId]!.push(timeDiff);
        }

        if (currCanon !== prevCanon) {
          if (timeDiff > 0 && timeDiff < 3600) {
            const legKey = `${prevCanon}->${currCanon}`;
            if (!tripLegTravelSec[trainNum]![legKey]) {
              tripLegTravelSec[trainNum]![legKey] = [];
            }
            tripLegTravelSec[trainNum]![legKey]!.push(timeDiff);
          }

          const active = trainActiveLeg[trainNum];
          if (active && schedule && schedule.s[active.fromStop] && schedule.s[prevCanon]) {
            const legKey = `${active.fromStop}->${prevCanon}`;
            const fromCoords = schedule.s[active.fromStop]!;
            const toCoords = schedule.s[prevCanon]!;
            const totalDist = haversineDistanceMeters(
              fromCoords.lat,
              fromCoords.lon,
              toCoords.lat,
              toCoords.lon,
            );
            const arrivalTs = snapshot.timestamp;

            if (totalDist > 0 && arrivalTs > active.departTs) {
              if (!tripLegProgressObs[trainNum]![legKey]) {
                tripLegProgressObs[trainNum]![legKey] = [];
              }
              for (const o of active.obs) {
                const distFromStart = haversineDistanceMeters(
                  fromCoords.lat,
                  fromCoords.lon,
                  o.lat,
                  o.lon,
                );
                const distFrac = Math.max(0, Math.min(1, distFromStart / totalDist));
                const timeFrac = Math.max(
                  0,
                  Math.min(1, (o.ts - active.departTs) / (arrivalTs - active.departTs)),
                );
                tripLegProgressObs[trainNum]![legKey]!.push({ distFrac, timeFrac });
              }
            }
          }

          trainActiveLeg[trainNum] = {
            fromStop: prevCanon,
            departTs: snapshot.timestamp,
            obs: [],
          };
        }
      }

      if (status.p && trainActiveLeg[trainNum]) {
        trainActiveLeg[trainNum]!.obs.push({
          ts: snapshot.timestamp,
          lat: status.p.la,
          lon: status.p.lo,
        });
      }

      prevTrainState[trainNum] = {
        timestamp: snapshot.timestamp,
        stopId,
        status: status.st,
        lat: status.p?.la,
        lon: status.p?.lo,
      };
    }
  }

  const profileTrips: Record<string, TripPerformance> = {};
  let totalTripRuns = 0;

  for (const [trainNum, stopRunsMap] of Object.entries(runStopDelays)) {
    const stopIds = Object.keys(stopRunsMap);
    if (stopIds.length === 0) continue;

    totalTripRuns++;

    const perStopDelays = stopIds.map((s) => Object.values(stopRunsMap[s]!));

    const rawP50Delays = perStopDelays.map((delays) => percentile(delays, 50));
    const rawP90Delays = perStopDelays.map((delays) => percentile(delays, 90));

    const minDwells = stopIds.map((s) => {
      const dwells = tripStopDwells[trainNum]?.[s] ?? [];
      return dwells.length > 0 ? percentile(dwells, 50) : 30;
    });

    const monotonicP50 = pavaIsotonicRegression(rawP50Delays);
    const monotonicP90 = pavaIsotonicRegression(rawP90Delays);

    const stops: Record<string, StopPerformance> = {};
    for (let i = 0; i < stopIds.length; i++) {
      const s = stopIds[i]!;
      stops[s] = {
        p50Delay: monotonicP50[i]!,
        p90Delay: Math.max(monotonicP90[i]!, monotonicP50[i]!),
        dwellSec: minDwells[i]!,
      };
    }

    const legs: Record<string, LegPerformance> = {};
    const legSecMap = tripLegTravelSec[trainNum] ?? {};
    const obsMap = tripLegProgressObs[trainNum] ?? {};
    for (const [legKey, times] of Object.entries(legSecMap)) {
      if (times.length === 0) continue;
      const medianTravelSec = percentile(times, 50);
      const p90TravelSec = percentile(times, 90);

      let curve: number[] | undefined = undefined;
      const obs = obsMap[legKey];
      if (obs && obs.length >= 20) {
        curve = [];
        const bins: number[][] = Array.from({ length: 10 }, () => []);
        for (const o of obs) {
          let binIdx = Math.floor(o.distFrac * 10);
          if (binIdx === 10) binIdx = 9;
          bins[binIdx]!.push(o.timeFrac);
        }

        for (let i = 0; i < 10; i++) {
          if (bins[i]!.length > 0) {
            curve[i] =
              percentile(
                bins[i]!.map((x) => x * 10000),
                50,
              ) / 10000;
          } else {
            curve[i] = -1;
          }
        }

        for (let i = 0; i < 10; i++) {
          if (curve[i] === -1) {
            let prevVal = 0;
            let prevIdx = -0.5;
            for (let j = i - 1; j >= 0; j--) {
              if (curve[j] !== -1) {
                prevVal = curve[j]!;
                prevIdx = j;
                break;
              }
            }

            let nextVal = 1;
            let nextIdx = 9.5;
            for (let j = i + 1; j < 10; j++) {
              if (curve[j] !== -1) {
                nextVal = curve[j]!;
                nextIdx = j;
                break;
              }
            }

            const weight = (i - prevIdx) / (nextIdx - prevIdx);
            curve[i] = prevVal + weight * (nextVal - prevVal);
          }
        }

        const curveScaled = pavaIsotonicRegression(curve.map((x) => Math.round(x * 10000)));
        curve = curveScaled.map((x) => x / 10000);
      }

      legs[legKey] = {
        medianTravelSec,
        p90TravelSec,
        medianSpeedMS: 25,
        ...(curve ? { curve } : {}),
      };
    }

    profileTrips[trainNum] = { stops, legs };
  }

  return {
    trips: profileTrips,
    meta: {
      generatedAt: Math.floor(Date.now() / 1000),
      windowDays,
      sampleSize: totalTripRuns,
    },
  };
}
