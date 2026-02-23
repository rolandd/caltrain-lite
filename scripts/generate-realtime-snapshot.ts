// SPDX-License-Identifier: MIT
// Copyright 2026 Roland Dreier <roland@rolandd.dev>

/**
 * Generate apps/pwa/src/lib/realtime-snapshot.json from worker protobuf fixtures.
 *
 * This uses the same parse + merge logic as worker/src/index.ts to keep the
 * dev fixture aligned with production API payload shape.
 *
 * Usage: npx tsx generate-realtime-snapshot.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFeed, buildRealtimeStatus } from '../worker/src/gtfs-rt.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = resolve(__dirname, '../worker/fixtures');
const outputPath = resolve(__dirname, '../apps/pwa/src/lib/realtime-snapshot.json');

function readFixtureArrayBuffer(filename: string): ArrayBuffer {
  const buf = readFileSync(resolve(fixturesDir, filename));
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

function main() {
  console.error(`Reading fixtures from: ${fixturesDir}`);

  const tripUpdates = parseFeed(readFixtureArrayBuffer('tripupdates.pb'));
  const vehiclePositions = parseFeed(readFixtureArrayBuffer('vehiclepositions.pb'));
  const serviceAlerts = parseFeed(readFixtureArrayBuffer('servicealerts.pb'));

  const status = buildRealtimeStatus(tripUpdates, vehiclePositions, serviceAlerts);
  const json = JSON.stringify(status);
  writeFileSync(outputPath, json, 'utf-8');

  console.error(`Wrote ${json.length} bytes to ${outputPath}`);
  console.error(`  Trips: ${Object.keys(status.byTrip).length}`);
  console.error(`  Alerts: ${status.a.length}`);
  console.error(`  Timestamp: ${status.t}`);
}

try {
  main();
} catch (err) {
  console.error('Fatal:', err);
  process.exit(1);
}
