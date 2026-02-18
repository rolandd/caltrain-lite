// SPDX-License-Identifier: MIT
// Copyright 2026 Roland Dreier <roland@rolandd.dev>

/**
 * Generate schedule-data.json from the GTFS fixture for the PWA prototype.
 *
 * Usage: npx tsx generate-schedule.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseGtfsZip } from './parse-gtfs.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturePath = resolve(__dirname, 'fixtures/caltrain-gtfs.zip');
const outputPath = resolve(__dirname, '../apps/pwa/src/lib/schedule-data.json');

async function main() {
  console.error(`Reading: ${fixturePath}`);
  const zipBuf = readFileSync(fixturePath);
  const schedule = await parseGtfsZip(zipBuf);
  const json = JSON.stringify(schedule);
  writeFileSync(outputPath, json, 'utf-8');
  console.error(`Wrote ${json.length} bytes to ${outputPath}`);
  console.error(`  Stations: ${Object.keys(schedule.s).length}`);
  console.error(`  Trips: ${schedule.t.length}`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
