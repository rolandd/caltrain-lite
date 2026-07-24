// SPDX-License-Identifier: MIT
// Copyright 2026 Roland Dreier <roland@rolandd.dev>

import { readdirSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import type {
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
  const pstDateStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

  const byDate: Record<string, RawTrainSnapshot[]> = {};
  for (const s of snapshots) {
    const d = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Los_Angeles',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(s.timestamp * 1000));

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
 * Enforces non-decreasing values (y[i+1] >= y[i] + minDwell).
 *
 * @param values Input sequence of numeric values (e.g. median arrival delays across stops)
 * @param minDwells Minimum dwell / gap required between consecutive stops (in seconds)
 */
export function pavaIsotonicRegression(values: number[], minDwells: number[]): number[] {
  if (values.length === 0) return [];
  if (values.length === 1) return [...values];

  interface Block {
    sum: number;
    weight: number;
    start: number;
    end: number;
  }

  const adjusted = new Array<number>(values.length);
  let cumDwell = 0;
  for (let i = 0; i < values.length; i++) {
    cumDwell += i > 0 ? (minDwells[i - 1] ?? 0) : 0;
    adjusted[i] = values[i]! - cumDwell;
  }

  const blocks: Block[] = adjusted.map((val, idx) => ({
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
    const blockVal = block.sum / block.weight;
    for (let idx = block.start; idx <= block.end; idx++) {
      let cumDwell = 0;
      for (let k = 1; k <= idx; k++) {
        cumDwell += minDwells[k - 1] ?? 0;
      }
      result[idx] = Math.round(blockVal + cumDwell);
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
): TrainPerformanceProfile {
  // Map: trainNum -> stopId -> runKey -> maxDelaySec
  const runStopDelays: Record<string, Record<string, Record<string, number>>> = {};
  const tripStopDwells: Record<string, Record<string, number[]>> = {};
  const tripLegTravelSec: Record<string, Record<string, number[]>> = {};

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

    const dateStr = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Los_Angeles',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(snapshot.timestamp * 1000));

    for (const [trainNum, status] of Object.entries(byTrip)) {
      if (!runStopDelays[trainNum]) runStopDelays[trainNum] = {};
      if (!tripStopDwells[trainNum]) tripStopDwells[trainNum] = {};
      if (!tripLegTravelSec[trainNum]) tripLegTravelSec[trainNum] = {};

      const stopId = status.s;
      const delaySec = status.d ?? 0;
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

        if (stopId === prev.stopId && (status.st === 1 || status.st === 0)) {
          if (!tripStopDwells[trainNum]![stopId]) {
            tripStopDwells[trainNum]![stopId] = [];
          }
          tripStopDwells[trainNum]![stopId]!.push(timeDiff);
        }

        if (stopId !== prev.stopId && timeDiff > 0 && timeDiff < 3600) {
          const legKey = `${prev.stopId}->${stopId}`;
          if (!tripLegTravelSec[trainNum]![legKey]) {
            tripLegTravelSec[trainNum]![legKey] = [];
          }
          tripLegTravelSec[trainNum]![legKey]!.push(timeDiff);
        }
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

    const monotonicP50 = pavaIsotonicRegression(rawP50Delays, minDwells);
    const monotonicP90 = pavaIsotonicRegression(rawP90Delays, minDwells);

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
    for (const [legKey, times] of Object.entries(legSecMap)) {
      if (times.length === 0) continue;
      const medianTravelSec = percentile(times, 50);
      const p90TravelSec = percentile(times, 90);
      legs[legKey] = {
        medianTravelSec,
        p90TravelSec,
        medianSpeedMS: 25,
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
