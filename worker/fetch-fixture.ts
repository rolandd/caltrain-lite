// SPDX-License-Identifier: MIT
// Copyright 2026 Roland Dreier <roland@rolandd.dev>

import { writeFileSync } from 'node:fs';
import { redact } from '../packages/utils/redact';

const apiKey = process.env.TRANSIT_511_API_KEY;
if (!apiKey) throw new Error('Missing TRANSIT_511_API_KEY environment variable');

/**
 * Fetches the TripUpdates GTFS-RT feed from 511.org and saves it as a fixture.
 * Throws an error if the request fails or the response is not OK.
 */
export async function fetchFixture(key: string): Promise<void> {
  const url = new URL('https://api.511.org/Transit/TripUpdates');
  url.searchParams.set('api_key', key);
  url.searchParams.set('agency', 'CT');

  console.log(`Fetching TripUpdates...`);
  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`Failed: ${response.status} ${response.statusText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  writeFileSync('fixtures/tripupdates.pb', Buffer.from(arrayBuffer));
  console.log(`Wrote ${arrayBuffer.byteLength} bytes to fixtures/tripupdates.pb`);
}

// Top-level execution with centralized error handling
fetchFixture(apiKey).catch((err) => {
  const errStr = err instanceof Error ? err.stack || err.message : String(err);
  console.error('Error fetching TripUpdates:', redact(errStr, apiKey));
  process.exit(1);
});
