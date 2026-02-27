// SPDX-License-Identifier: MIT
// Copyright 2026 Roland Dreier <roland@rolandd.dev>

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import Pbf from 'pbf';
import { parseFeed } from '../src/gtfs-rt.js';
import { writeFeedMessage } from '../src/gtfs-realtime.js';

function toArrayBuffer(buf: Buffer): ArrayBuffer {
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

function encodeFeed(message: unknown): ArrayBuffer {
  const pbf = new Pbf();
  writeFeedMessage(message, pbf);
  const bytes = pbf.finish();
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

// Fixture smoke check
const fixturePath = 'fixtures/tripupdates.pb';
const fixtureFeed = parseFeed(toArrayBuffer(readFileSync(fixturePath)));
assert.ok(Array.isArray(fixtureFeed.e), 'Fixture parse should produce an entity list');

// Regression checks for delay selection logic.
const synthetic = parseFeed(
  encodeFeed({
    header: { gtfs_realtime_version: '2.0', timestamp: 1 },
    entity: [
      {
        id: 'e1',
        trip_update: {
          trip: { trip_id: 'T1' },
          delay: 120,
          stop_time_update: [
            { stop_id: 'S1', departure: { delay: 0 } },
            { stop_id: 'S2', departure: { delay: 600 } },
          ],
        },
      },
      {
        id: 'e2',
        trip_update: {
          trip: { trip_id: 'T2' },
          delay: -120,
          stop_time_update: [{ stop_id: 'S3', arrival: { delay: 0 } }],
        },
      },
      {
        id: 'e3',
        trip_update: {
          trip: { trip_id: 'T3' },
          delay: 300,
        },
      },
    ],
  }),
);

const byTrip = new Map(synthetic.e.map((e) => [e.i, e]));
assert.equal(byTrip.get('T1')?.d, 600, 'Should use first non-zero stop-level delay');
assert.equal(byTrip.get('T1')?.s, 'S2', 'Stop should align with selected non-zero delay');
assert.equal(
  byTrip.get('T2')?.d,
  -120,
  'Should fall back to trip-level delay when stop delays are zero',
);
assert.equal(byTrip.get('T2')?.s, 'S3', 'Should still keep stop context when present');
assert.equal(byTrip.get('T3')?.d, 300, 'Should use trip-level delay when no stop updates exist');
assert.equal(byTrip.get('T3')?.s, undefined, 'No stop should be set when stop updates are absent');

console.log('Test Passed!');
