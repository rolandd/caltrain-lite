// SPDX-License-Identifier: MIT
// Copyright 2026 Roland Dreier <roland@rolandd.dev>

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Bench } from 'tinybench';
import { buildRealtimeStatus, parseFeed } from '../src/gtfs-rt.js';

function toArrayBuffer(buf: Buffer): ArrayBuffer {
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

function readFixture(name: string): ArrayBuffer {
  const here = dirname(fileURLToPath(import.meta.url));
  return toArrayBuffer(readFileSync(join(here, '..', 'fixtures', name)));
}

// Stable defaults for reproducible local comparisons without extra CLI flags.
const BENCHMARK_TIME_MS = 3000;
const WARMUP_TIME_MS = 1000;

const tripUpdatesBuffer = readFixture('tripupdates.pb');
const vehiclePositionsBuffer = readFixture('vehiclepositions.pb');
const serviceAlertsBuffer = readFixture('servicealerts.pb');

let sink = 0;

const bench = new Bench({
  time: BENCHMARK_TIME_MS,
  warmupTime: WARMUP_TIME_MS,
});

bench
  .add('parseFeed(tripupdates)', () => {
    sink ^= parseFeed(tripUpdatesBuffer).e.length;
  })
  .add('parseFeed(vehiclepositions)', () => {
    sink ^= parseFeed(vehiclePositionsBuffer).p.size;
  })
  .add('parseFeed(servicealerts)', () => {
    sink ^= parseFeed(serviceAlertsBuffer).a.length;
  })
  .add('build realtime status (parse + merge)', () => {
    const status = buildRealtimeStatus(
      parseFeed(tripUpdatesBuffer),
      parseFeed(vehiclePositionsBuffer),
      parseFeed(serviceAlertsBuffer),
    );
    sink ^= Object.keys(status.byTrip).length + status.a.length;
  });

await bench.run();

console.log(`GTFS-RT benchmark config: time=${BENCHMARK_TIME_MS}ms, warmup=${WARMUP_TIME_MS}ms`);
console.table(bench.table());
console.log(`sink=${sink}`);
