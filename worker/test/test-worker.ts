// SPDX-License-Identifier: MIT
// Copyright 2026 Roland Dreier <roland@rolandd.dev>

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PbfWriter } from 'pbf';
import { parseFeed } from '../src/gtfs-rt';
import { writeFeedMessage } from '../src/gtfs-realtime';

function toArrayBuffer(buf: Buffer): ArrayBuffer {
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

function encodeFeed(message: unknown): ArrayBuffer {
  const pbf = new PbfWriter();
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

// --- Worker Endpoint Routing Tests ---
import worker, { type Env } from '../src/index';

const mockKVData: Record<string, string> = {
  'schedule:data': '{"m":{"v":"v1","e":20261231,"sv":1},"x":{}}',
  'schedule:v2:data': '{"m":{"v":"v1","e":20261231,"sv":2}}',
  'schedule:meta': '{"v":"v1","e":20261231,"sv":1}',
  'schedule:v2:meta': '{"v":"v1","e":20261231,"sv":2}',
};

const mockEnv: Env = {
  TRANSIT_511_API_KEY: 'test-key',
  TRANSIT_DATA: {
    get: async (key: string) => mockKVData[key] ?? null,
    getWithMetadata: async () => ({ value: null, metadata: null }),
  } as unknown as KVNamespace,
  TRANSIT_DB: {} as D1Database,
};

const ctx = {} as ExecutionContext;

// 1. Test GET /api/schedule serves v1
const resV1 = await worker.fetch(
  new Request('https://transit.example.com/api/schedule'),
  mockEnv,
  ctx,
);
assert.equal(resV1.status, 200);
const bodyV1 = (await resV1.json()) as { m: { sv: number }; x?: unknown };
assert.equal(bodyV1.m.sv, 1);
assert.ok('x' in bodyV1);

// 2. Test GET /api/v2/schedule serves v2
const resV2 = await worker.fetch(
  new Request('https://transit.example.com/api/v2/schedule'),
  mockEnv,
  ctx,
);
assert.equal(resV2.status, 200);
const bodyV2 = (await resV2.json()) as { m: { sv: number }; x?: unknown };
assert.equal(bodyV2.m.sv, 2);
assert.ok(!('x' in bodyV2));

// 3. Test GET /api/meta serves v1 metadata
const resMetaV1 = await worker.fetch(
  new Request('https://transit.example.com/api/meta'),
  mockEnv,
  ctx,
);
assert.equal(resMetaV1.status, 200);
const bodyMetaV1 = (await resMetaV1.json()) as { sv: number };
assert.equal(bodyMetaV1.sv, 1);

// 4. Test GET /api/v2/meta serves v2 metadata
const resMetaV2 = await worker.fetch(
  new Request('https://transit.example.com/api/v2/meta'),
  mockEnv,
  ctx,
);
assert.equal(resMetaV2.status, 200);
const bodyMetaV2 = (await resMetaV2.json()) as { sv: number };
assert.equal(bodyMetaV2.sv, 2);

// 5. Test v2 fallback to v1 when v2 key not yet populated in KV
const mockEnvFallback: Env = {
  ...mockEnv,
  TRANSIT_DATA: {
    get: async (key: string) => {
      if (key.includes(':v2:')) return null;
      return mockKVData[key] ?? null;
    },
    getWithMetadata: async () => ({ value: null, metadata: null }),
  } as unknown as KVNamespace,
};

const resV2Fallback = await worker.fetch(
  new Request('https://transit.example.com/api/v2/schedule'),
  mockEnvFallback,
  ctx,
);
assert.equal(resV2Fallback.status, 200);
const bodyV2Fallback = (await resV2Fallback.json()) as { m: { sv: number } };
assert.equal(bodyV2Fallback.m.sv, 1); // Successfully fell back to schedule:data

console.log('Test Passed!');
