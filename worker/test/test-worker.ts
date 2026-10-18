// SPDX-License-Identifier: MIT
// Copyright 2026 Roland Dreier <roland@rolandd.dev>

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PbfWriter } from 'pbf';
import { parseFeed } from '../src/gtfs-rt';
import {
  fetchFeedStage,
  parseFeedStage,
  FeedStage,
  FEED_STAGE_NAMES,
  emptyParsedFeed,
} from '../src/feed-poll';
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

// 6. Test /api/v2/meta fallback to schedule:meta when schedule:v2:meta not populated
const resMetaV2Fallback = await worker.fetch(
  new Request('https://transit.example.com/api/v2/meta'),
  mockEnvFallback,
  ctx,
);
assert.equal(resMetaV2Fallback.status, 200);
const bodyMetaV2Fallback = (await resMetaV2Fallback.json()) as { sv: number };
assert.equal(bodyMetaV2Fallback.sv, 1); // Successfully fell back to schedule:meta

// 7. feed-poll: per-feed pipeline stage classification
const originalFetch = globalThis.fetch;
try {
  // a. fetch() throws (network/DNS/timeout) -> FETCH_ERROR, retried up to maxAttempts
  globalThis.fetch = (async () => {
    throw new TypeError('fetch failed');
  }) as typeof fetch;
  let res = await fetchFeedStage('Test', 'https://example.invalid/feed', 1000, 3, 0);
  assert.equal(res.stage, FeedStage.FETCH_ERROR);
  assert.equal(res.status, null);
  assert.equal(res.attempts, 3);
  assert.equal(typeof res.durationMs, 'number');
  assert.equal(res.bytes, null);
  assert.ok(res.error);

  // b. non-200 (500) -> HTTP_ERROR, retried up to maxAttempts
  globalThis.fetch = (async () => new Response('Server Error', { status: 500 })) as typeof fetch;
  res = await fetchFeedStage('Test', 'https://example.invalid/feed', 1000, 3, 0);
  assert.equal(res.stage, FeedStage.HTTP_ERROR);
  assert.equal(res.status, 500);
  assert.equal(res.attempts, 3);
  assert.equal(typeof res.durationMs, 'number');
  assert.equal(res.bytes, 'Server Error'.length);

  // c. permanent 4xx (403 Forbidden) -> HTTP_ERROR, NOT retried (attempts === 1)
  globalThis.fetch = (async () => new Response('Forbidden', { status: 403 })) as typeof fetch;
  res = await fetchFeedStage('Test', 'https://example.invalid/feed', 1000, 3, 0);
  assert.equal(res.stage, FeedStage.HTTP_ERROR);
  assert.equal(res.status, 403);
  assert.equal(res.attempts, 1);
  assert.equal(res.bytes, 'Forbidden'.length);

  // c2. 429 Too Many Requests -> HTTP_ERROR, NOT retried (attempts === 1)
  globalThis.fetch = (async () =>
    new Response('Rate limit exceeded', { status: 429 })) as typeof fetch;
  res = await fetchFeedStage('Test', 'https://example.invalid/feed', 1000, 3, 0);
  assert.equal(res.stage, FeedStage.HTTP_ERROR);
  assert.equal(res.status, 429);
  assert.equal(res.attempts, 1);
  assert.equal(res.bytes, 'Rate limit exceeded'.length);

  // d. transient failure recovered on retry: attempt 1 returns 500, attempt 2 returns valid feed
  let callCount = 0;
  globalThis.fetch = (async () => {
    callCount++;
    if (callCount === 1) {
      return new Response('Transient 500', { status: 500 });
    }
    return new Response(
      encodeFeed({
        header: { gtfs_realtime_version: '2.0', timestamp: 9999 },
        entity: [{ id: 'e1', trip_update: { trip: { trip_id: 'T1' }, delay: 30 } }],
      }),
      { status: 200 },
    );
  }) as typeof fetch;
  res = await fetchFeedStage('Test', 'https://example.invalid/feed', 1000, 3, 0);
  assert.equal(res.stage, FeedStage.OK);
  assert.equal(res.status, 200);
  assert.equal(res.attempts, 2);
  assert.ok(typeof res.bytes === 'number' && res.bytes > 0);
  assert.equal(res.feed?.t, 9999);

  // d2. durationMs accumulates active fetch/parse time across retries, excluding backoff sleep
  callCount = 0;
  globalThis.fetch = (async () => {
    callCount++;
    if (callCount === 1) {
      return new Response('Server Error', { status: 500 });
    }
    return new Response(
      encodeFeed({
        header: { gtfs_realtime_version: '2.0', timestamp: 8888 },
        entity: [],
      }),
      { status: 200 },
    );
  }) as typeof fetch;
  const backoffDelay = 150;
  res = await fetchFeedStage('Test', 'https://example.invalid/feed', 1000, 2, backoffDelay);
  assert.equal(res.stage, FeedStage.OK);
  assert.equal(res.attempts, 2);
  assert.ok(
    res.durationMs !== null && res.durationMs < backoffDelay,
    `Expected durationMs (${res.durationMs}ms) to be less than backoff sleep (${backoffDelay}ms)`,
  );

  // e. 200 with zero-byte body -> EMPTY_BODY
  globalThis.fetch = (async () =>
    new Response(new ArrayBuffer(0), { status: 200 })) as typeof fetch;
  res = await fetchFeedStage('Test', 'https://example.invalid/feed', 1000, 2, 0);
  assert.equal(res.stage, FeedStage.EMPTY_BODY);
  assert.equal(res.status, 200);
  assert.equal(res.attempts, 2);
  assert.equal(typeof res.durationMs, 'number');
  assert.equal(res.bytes, 0);

  // f. 200 with malformed protobuf -> PARSE_ERROR
  globalThis.fetch = (async () =>
    new Response(new Uint8Array([0x0f]), { status: 200 })) as typeof fetch;
  res = await fetchFeedStage('Test', 'https://example.invalid/feed', 1000, 2, 0);
  assert.equal(res.stage, FeedStage.PARSE_ERROR);
  assert.equal(res.status, 200);
  assert.equal(res.attempts, 2);
  assert.equal(typeof res.durationMs, 'number');
  assert.equal(res.bytes, 1);

  // g. decodes but has no header timestamp -> INVALID_FEED. This is how
  // 511.org error text served with HTTP 200 surfaces (it decodes as an
  // empty feed with t=0 rather than throwing).
  res = parseFeedStage(
    'Test',
    encodeFeed({
      entity: [
        {
          id: 'e1',
          vehicle: { trip: { trip_id: 'T1' }, position: { latitude: 37, longitude: -122 } },
        },
      ],
    }),
    200,
  );
  assert.equal(res.stage, FeedStage.INVALID_FEED);
  assert.equal(res.durationMs, null);
  assert.equal(res.attempts, 1);

  // h. valid header + trip_update entity -> OK with parsed feed attached
  res = parseFeedStage(
    'Test',
    encodeFeed({
      header: { gtfs_realtime_version: '2.0', timestamp: 1234 },
      entity: [{ id: 'e1', trip_update: { trip: { trip_id: 'T1' }, delay: 60 } }],
    }),
    200,
    42,
    1,
  );
  assert.equal(res.stage, FeedStage.OK);
  assert.equal(res.status, 200);
  assert.equal(res.durationMs, 42);
  assert.equal(res.attempts, 1);
  assert.equal(res.feed?.t, 1234);
  assert.equal(res.feed?.e.length, 1);

  // i. valid header with zero entities -> OK (legitimate off-hours feed)
  res = parseFeedStage(
    'Test',
    encodeFeed({ header: { gtfs_realtime_version: '2.0', timestamp: 1234 } }),
    200,
  );
  assert.equal(res.stage, FeedStage.OK);
  assert.equal(res.feed?.e.length, 0);

  // j. HTTP 200 with JSON error text -> PARSE_ERROR with sniffed upstream text
  const jsonErrorBody = new TextEncoder().encode('{"message": "Rate limit exceeded"}').buffer;
  res = parseFeedStage('Test', jsonErrorBody, 200);
  assert.equal(res.stage, FeedStage.PARSE_ERROR);
  assert.ok(res.error?.includes('upstream text: "{"message": "Rate limit exceeded"}"'));

  // k. HTTP 503 with gateway error body -> HTTP_ERROR with sniffed status text
  globalThis.fetch = (async () =>
    new Response('Upstream gateway timeout', { status: 503 })) as typeof fetch;
  res = await fetchFeedStage('Test', 'https://example.invalid/feed', 1000, 1, 0);
  assert.equal(res.stage, FeedStage.HTTP_ERROR);
  assert.equal(res.status, 503);
  assert.ok(res.error?.includes('HTTP 503: "Upstream gateway timeout"'));

  // l. degenerate maxAttempts (0 or negative) is clamped to a single attempt
  // rather than skipping the loop and returning null
  let degenerateCalls = 0;
  globalThis.fetch = (async () => {
    degenerateCalls++;
    return new Response(encodeFeed({ header: { gtfs_realtime_version: '2.0', timestamp: 1 } }), {
      status: 200,
    });
  }) as typeof fetch;
  for (const badMaxAttempts of [0, -1, -10]) {
    res = await fetchFeedStage('Test', 'https://example.invalid/feed', 1000, badMaxAttempts, 0);
    assert.equal(res.stage, FeedStage.OK);
    assert.equal(res.attempts, 1);
    assert.equal(res.feed?.t, 1);
  }
  assert.equal(degenerateCalls, 3); // exactly one attempt per call
} finally {
  globalThis.fetch = originalFetch;
}

// 8. feed-poll: stage names cover every code and emptyParsedFeed is inert
for (const stage of Object.values(FeedStage)) {
  assert.ok(FEED_STAGE_NAMES[stage], `Missing name for stage ${stage}`);
}
const empty = emptyParsedFeed();
assert.equal(empty.t, 0);
assert.equal(empty.e.length, 0);
assert.equal(empty.p.size, 0);
assert.equal(empty.a.length, 0);

console.log('Test Passed!');
