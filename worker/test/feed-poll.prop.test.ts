// SPDX-License-Identifier: MIT
// Copyright 2026 Roland Dreier <roland@rolandd.dev>

import assert from 'node:assert/strict';
import fc from 'fast-check';
import {
  FeedStage,
  parseFeedStage,
  fetchFeedStage,
  sniffAsciiText,
  isRetryableFeedResult,
  type FeedResult,
} from '../src/feed-poll';
import { PbfWriter } from 'pbf';
import { writeFeedMessage } from '../src/gtfs-realtime';

function encodeFeed(message: unknown): ArrayBuffer {
  const pbf = new PbfWriter();
  writeFeedMessage(message, pbf);
  const bytes = pbf.finish();
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

console.log('Running feed-poll property-based tests...');

// 1. Invariant: parseFeedStage never throws on arbitrary byte streams (fuzzing)
fc.assert(
  fc.property(fc.uint8Array({ minLength: 0, maxLength: 2048 }), (bytes) => {
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const result = parseFeedStage('Test', buffer, 200);

    assert.ok(typeof result.stage === 'number');
    assert.equal(result.endpoint, 'Test');
    assert.equal(result.status, 200);
    assert.equal(result.bytes, buffer.byteLength);

    if (result.stage === FeedStage.OK) {
      assert.ok(result.feed);
      assert.ok(result.feed.t > 0);
      assert.equal(result.error, undefined);
    } else {
      assert.equal(result.feed, undefined);
      assert.ok(typeof result.error === 'string' && result.error.length > 0);
    }
  }),
  { numRuns: 200 },
);

// 2. Invariant: sniffAsciiText correctly identifies printable ASCII text
fc.assert(
  fc.property(
    // Require at least one non-whitespace character: sniffAsciiText collapses
    // and trims whitespace-only text to '' and returns null, so a whitespace-only
    // string would fail the not-null assertion without indicating a real bug.
    fc
      .string({ minLength: 10, maxLength: 100 })
      .filter((s) => /^[\x20-\x7e\t\r\n]+$/.test(s) && /\S/.test(s)),
    (text) => {
      const buffer = new TextEncoder().encode(text).buffer;
      const sniffed = sniffAsciiText(buffer);
      assert.ok(sniffed !== null, `Expected text "${text}" to be recognized as ASCII`);
      assert.ok(sniffed.length > 0);

      // Verify that parseFeedStage incorporates the sniffed text on decode failure
      const result = parseFeedStage('Test', buffer, 200);
      assert.ok(result.error?.includes('upstream text:'));
    },
  ),
  { numRuns: 100 },
);

// 3. Invariant: Retryability rules are consistent across all HTTP status codes
fc.assert(
  fc.property(fc.integer({ min: 100, max: 599 }), (status) => {
    const result: FeedResult = {
      endpoint: 'Test',
      stage: FeedStage.HTTP_ERROR,
      status,
      durationMs: 10,
      bytes: 20,
      attempts: 1,
      error: `HTTP ${status}`,
    };

    const retryable = isRetryableFeedResult(result);
    if (status >= 500) {
      assert.equal(retryable, true, `Status ${status} should be retryable`);
    } else if (status >= 400 && status < 500) {
      assert.equal(retryable, false, `Client/quota error status ${status} should not be retryable`);
    }
  }),
  { numRuns: 100 },
);

// 4. Invariant: Permanent 4xx errors terminate immediately on attempt 1 without retry
const permanentStatusArb = fc.constantFrom(400, 401, 403, 404, 405, 410, 422, 429);
await fc.assert(
  fc.asyncProperty(
    permanentStatusArb,
    fc.integer({ min: 1, max: 5 }),
    async (status, maxAttempts) => {
      const originalFetch = globalThis.fetch;
      let calls = 0;
      globalThis.fetch = (async () => {
        calls++;
        return new Response(`Client Error ${status}`, { status });
      }) as typeof fetch;

      try {
        const result = await fetchFeedStage(
          'Test',
          'https://example.invalid',
          1000,
          maxAttempts,
          0,
        );
        assert.equal(result.stage, FeedStage.HTTP_ERROR);
        assert.equal(result.status, status);
        assert.equal(result.attempts, 1, `Status ${status} should never retry`);
        assert.equal(calls, 1);
      } finally {
        globalThis.fetch = originalFetch;
      }
    },
  ),
  { numRuns: 30 },
);

// 5. Invariant: Transient failures retry up to maxAttempts or succeed early
const transientStatusArb = fc.constantFrom(500, 502, 503, 504);
await fc.assert(
  fc.asyncProperty(
    transientStatusArb,
    fc.integer({ min: 1, max: 4 }), // maxAttempts
    fc.integer({ min: 1, max: 4 }), // attempt on which it succeeds (if <= maxAttempts)
    async (transientStatus, maxAttempts, succeedOnAttempt) => {
      const originalFetch = globalThis.fetch;
      let calls = 0;
      globalThis.fetch = (async () => {
        calls++;
        if (calls === succeedOnAttempt) {
          return new Response(
            encodeFeed({
              header: { gtfs_realtime_version: '2.0', timestamp: 12345 },
              entity: [{ id: 'e1', trip_update: { trip: { trip_id: 'T1' } } }],
            }),
            { status: 200 },
          );
        }
        return new Response(`Error ${transientStatus}`, { status: transientStatus });
      }) as typeof fetch;

      try {
        const result = await fetchFeedStage(
          'Test',
          'https://example.invalid',
          1000,
          maxAttempts,
          0,
        );

        if (succeedOnAttempt <= maxAttempts) {
          assert.equal(result.stage, FeedStage.OK);
          assert.equal(result.status, 200);
          assert.equal(result.attempts, succeedOnAttempt);
          assert.equal(calls, succeedOnAttempt);
          assert.equal(result.feed?.t, 12345);
        } else {
          assert.equal(result.stage, FeedStage.HTTP_ERROR);
          assert.equal(result.status, transientStatus);
          assert.equal(result.attempts, maxAttempts);
          assert.equal(calls, maxAttempts);
        }
      } finally {
        globalThis.fetch = originalFetch;
      }
    },
  ),
  { numRuns: 30 },
);

console.log('All property-based tests passed!');
