// SPDX-License-Identifier: MIT
// Copyright 2026 Roland Dreier <roland@rolandd.dev>

import { readFileSync } from 'node:fs';
import type { StaticSchedule } from '../packages/types/schema.d.ts';

/**
 * Basic validation for the generated static-schedule.json.
 * Ensures the data is not empty and has a sane structure before
 * we push it to Cloudflare KV.
 */

export function validateSchedule(schedule: StaticSchedule): string[] {
  const errors: string[] = [];

  // 1. Metadata checks
  if (!schedule.m) {
    errors.push('Missing metadata (m)');
  } else {
    if (!schedule.m.v) errors.push('Missing version hash (m.v)');
    if (!schedule.m.e || schedule.m.e < 20260101) {
      errors.push(`Invalid end date (m.e): ${schedule.m.e}`);
    }
    if (typeof schedule.m.sv !== 'number') errors.push('Missing schema version (m.sv)');
  }

  // 2. Minimum data volume (Catch catastrophic parsing failures)
  const stationCount = Object.keys(schedule.s || {}).length;
  if (stationCount < 10) errors.push(`Too few stations: ${stationCount} (expected ~31)`);

  const tripCount = (schedule.t || []).length;
  if (tripCount < 10) errors.push(`Too few trips: ${tripCount} (expected ~70+)`);

  const patternCount = Object.keys(schedule.p || {}).length;
  if (patternCount < 2) errors.push(`Too few patterns: ${patternCount} (need at least NB/SB)`);

  // 3. Referential integrity
  const stationIds = new Set(Object.keys(schedule.s || {}));
  const patternIds = new Set(Object.keys(schedule.p || {}));
  const serviceIds = new Set([
    ...Object.keys(schedule.r?.c || {}),
    ...Object.keys(schedule.r?.e || {}),
  ]);

  // Check patterns reference valid stations
  for (const [pId, pStops] of Object.entries(schedule.p || {})) {
    for (const stopId of pStops) {
      if (!stationIds.has(stopId)) {
        errors.push(`Pattern ${pId} references unknown station: ${stopId}`);
      }
    }
  }

  // Check trips reference valid patterns and services
  for (const trip of schedule.t || []) {
    if (!patternIds.has(trip.p)) {
      errors.push(`Trip ${trip.i} references unknown pattern: ${trip.p}`);
    }
    if (!serviceIds.has(trip.s)) {
      errors.push(`Trip ${trip.i} references unknown service: ${trip.s}`);
    }
    // Check stop times length matches pattern
    const pattern = schedule.p[trip.p];
    if (pattern && trip.st.length !== pattern.length * 2) {
      errors.push(
        `Trip ${trip.i} stop times length (${trip.st.length}) mismatch pattern ${trip.p} (${pattern.length * 2})`,
      );
    }
  }

  // 4. Check ordered station list
  if (!Array.isArray(schedule.o) || schedule.o.length === 0) {
    errors.push('Missing or empty ordered station list (o)');
  } else {
    for (const id of schedule.o) {
      if (!stationIds.has(id)) {
        errors.push(`Ordered list references unknown station: ${id}`);
      }
    }
  }

  return errors;
}

/** CLI entry point */
function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('Usage: validate-schedule.ts <path-to-json>');
    process.exit(1);
  }

  console.log(`Validating schedule: ${filePath}`);

  let schedule: StaticSchedule;
  try {
    const content = readFileSync(filePath, 'utf-8');
    schedule = JSON.parse(content) as StaticSchedule;
  } catch (err) {
    console.error('Failed to parse or read schedule file:', err);
    process.exit(1);
  }

  const errors = validateSchedule(schedule);

  if (errors.length > 0) {
    console.error('Validation failed:');
    errors.forEach((e) => console.error(` - ${e}`));
    process.exit(1);
  }

  console.log('Validation successful!');
  console.log(` - Stations: ${Object.keys(schedule.s).length}`);
  console.log(` - Trips: ${schedule.t.length}`);
  console.log(` - Patterns: ${Object.keys(schedule.p).length}`);
  console.log(` - End Date: ${schedule.m.e}`);
}

// Run main() only when executed directly (not imported)
const isMainModule = process.argv[1]?.endsWith('validate-schedule.ts');
if (isMainModule) {
  main();
}
