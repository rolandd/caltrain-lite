// SPDX-License-Identifier: MIT
// Copyright 2026 Roland Dreier <roland@rolandd.dev>

import { readFileSync, writeFileSync } from 'node:fs';

const apiKey = process.env.TRANSIT_511_API_KEY;
if (!apiKey) throw new Error('Missing TRANSIT_511_API_KEY environment variable');

const url = new URL('https://api.511.org/Transit/TripUpdates');
url.searchParams.set('api_key', apiKey);
url.searchParams.set('agency', 'CT');

console.log(`Fetching TripUpdates...`);
try {
  const response = await fetch(url.toString());
  if (!response.ok) throw new Error(`Failed: ${response.status} ${response.statusText}`);

  const arrayBuffer = await response.arrayBuffer();
  writeFileSync('fixtures/tripupdates.pb', Buffer.from(arrayBuffer));
  console.log(`Wrote ${arrayBuffer.byteLength} bytes to fixtures/tripupdates.pb`);
} catch (err) {
  const errStr = err instanceof Error ? err.stack || err.message : String(err);
  let redacted = errStr;
  if (apiKey) {
    redacted = redacted.replaceAll(apiKey, 'REDACTED');
    const encodedKey = encodeURIComponent(apiKey);
    if (encodedKey !== apiKey) {
      redacted = redacted.replaceAll(encodedKey, 'REDACTED');
    }
  }
  console.error(`Error fetching TripUpdates:`, redacted);
  process.exit(1);
}
