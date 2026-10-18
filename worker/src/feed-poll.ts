// SPDX-License-Identifier: MIT
// Copyright 2026 Roland Dreier <roland@rolandd.dev>

import { parseFeed, type ParsedFeed } from './gtfs-rt';

/**
 * Per-feed outcome stages, ordered by pipeline depth.
 * Stored in D1 as small integers (see migrations/0002_feed_polls.sql);
 * names are for logs and future UI only.
 *
 * 0 = OK, so `stage > 0` means the feed failed at that layer:
 *   1 fetch() threw (network, DNS, timeout) — no HTTP status exists
 *   2 got a response but status was not 200
 *   3 HTTP 200 but zero-byte body
 *   4 protobuf decode threw
 *   5 decoded but missing required structure (header timestamp absent/zero)
 */
export const FeedStage = {
  OK: 0,
  FETCH_ERROR: 1,
  HTTP_ERROR: 2,
  EMPTY_BODY: 3,
  PARSE_ERROR: 4,
  INVALID_FEED: 5,
} as const;

export type FeedStageValue = (typeof FeedStage)[keyof typeof FeedStage];

export const FEED_STAGE_NAMES: Record<FeedStageValue, string> = {
  [FeedStage.OK]: 'ok',
  [FeedStage.FETCH_ERROR]: 'fetch_error',
  [FeedStage.HTTP_ERROR]: 'http_error',
  [FeedStage.EMPTY_BODY]: 'empty_body',
  [FeedStage.PARSE_ERROR]: 'parse_error',
  [FeedStage.INVALID_FEED]: 'invalid_feed',
};

/** Outcome of one feed through the fetch/parse pipeline. Never throws. */
export interface FeedResult {
  endpoint: string;
  stage: FeedStageValue;
  /** HTTP status; null when fetch failed before a response existed. */
  status: number | null;
  /** Fetch and parse duration in milliseconds (cumulative active time across all attempts, excluding backoff sleep); null when not fetched over network. */
  durationMs: number | null;
  /** Response payload size in bytes; null when fetch failed before body was received. */
  bytes: number | null;
  /** Number of attempts made (1 = first try succeeded, >1 = required retries). */
  attempts: number;
  /** Parsed feed, present only when stage === OK. */
  feed?: ParsedFeed;
  /** Short error detail, present only when stage > 0. */
  error?: string;
}

/** Fresh empty ParsedFeed, used as a stand-in for feeds that failed. */
export function emptyParsedFeed(): ParsedFeed {
  return { t: 0, e: [], p: new Map(), a: [] };
}

/**
 * Determine if a failed FeedResult should be retried.
 * - Retryable: network errors/timeouts, HTTP >= 500, empty body, parse error, invalid feed
 * - Non-retryable: 4xx client and quota errors (400, 401, 403, 404, 429, etc.)
 */
export function isRetryableFeedResult(result: FeedResult): boolean {
  if (result.stage === FeedStage.OK) return false;
  if (result.stage === FeedStage.HTTP_ERROR) {
    // Only 5xx server errors are retryable. All 4xx errors (including 429 Too Many
    // Requests) fail fast on attempt 1: retrying within milliseconds against an active
    // rate limiter is counterproductive, whereas the next 2-minute cron tick is the natural retry.
    return result.status !== null && result.status >= 500;
  }
  return true;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Detect if a response body is human-readable ASCII text (JSON, XML, HTML, or plain text)
 * rather than a binary protobuf feed.
 */
export function sniffAsciiText(buffer: ArrayBuffer, maxChars = 150): string | null {
  if (buffer.byteLength === 0) return null;
  const sample = new Uint8Array(buffer.slice(0, maxChars));

  // Count printable ASCII characters (space to tilde, plus whitespace)
  let printable = 0;
  for (let i = 0; i < sample.length; i++) {
    const b = sample[i];
    if ((b >= 0x20 && b <= 0x7e) || b === 0x09 || b === 0x0a || b === 0x0d) {
      printable++;
    }
  }

  // If >85% printable ASCII and at least 4 bytes, it is text/JSON/XML/HTML rather than binary protobuf
  if (sample.length >= 4 && printable / sample.length > 0.85) {
    const text = new TextDecoder().decode(sample).replace(/\s+/g, ' ').trim();
    return text.length > 0 ? text.slice(0, 120) : null;
  }
  return null;
}

/**
 * Perform a single HTTP fetch and parse attempt for a feed.
 */
async function fetchFeedSingle(
  endpoint: string,
  url: string,
  timeoutMs: number,
): Promise<FeedResult> {
  const startedAt = Date.now();
  let resp: Response;
  try {
    resp = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  } catch (err) {
    return {
      endpoint,
      stage: FeedStage.FETCH_ERROR,
      status: null,
      durationMs: Date.now() - startedAt,
      bytes: null,
      attempts: 1,
      error: describe(err),
    };
  }

  if (!resp.ok) {
    let httpError = `HTTP ${resp.status}`;
    let errBytes: number | null = null;
    try {
      const errBody = await resp.arrayBuffer();
      errBytes = errBody.byteLength;
      const text = sniffAsciiText(errBody);
      if (text) {
        httpError = `HTTP ${resp.status}: "${text}"`;
      }
    } catch {
      // Ignore body reading failure on non-200
    }
    return {
      endpoint,
      stage: FeedStage.HTTP_ERROR,
      status: resp.status,
      durationMs: Date.now() - startedAt,
      bytes: errBytes,
      attempts: 1,
      error: httpError,
    };
  }

  let body: ArrayBuffer;
  try {
    body = await resp.arrayBuffer();
  } catch (err) {
    return {
      endpoint,
      stage: FeedStage.FETCH_ERROR,
      status: resp.status,
      durationMs: Date.now() - startedAt,
      bytes: null,
      attempts: 1,
      error: describe(err),
    };
  }

  if (body.byteLength === 0) {
    return {
      endpoint,
      stage: FeedStage.EMPTY_BODY,
      status: resp.status,
      durationMs: Date.now() - startedAt,
      bytes: 0,
      attempts: 1,
      error: 'Empty response body',
    };
  }

  return parseFeedStage(endpoint, body, resp.status, Date.now() - startedAt, 1);
}

/**
 * Fetch one GTFS-RT endpoint with retries and classify the outcome by pipeline stage.
 * Never throws: failures are returned as FeedResult values so that one
 * broken feed cannot discard the results of the healthy ones.
 */
export async function fetchFeedStage(
  endpoint: string,
  url: string,
  timeoutMs = 4000,
  maxAttempts = 3,
  backoffMs = 300,
): Promise<FeedResult> {
  // Belt-and-suspenders: always attempt at least once so lastResult can never
  // stay null (and the `lastResult!` below can never lie) if misconfigured.
  const attempts = Math.max(1, maxAttempts);
  let totalActiveMs = 0;
  let lastResult: FeedResult | null = null;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    lastResult = await fetchFeedSingle(endpoint, url, timeoutMs);
    totalActiveMs += lastResult.durationMs ?? 0;
    lastResult.attempts = attempt;
    lastResult.durationMs = totalActiveMs;

    if (lastResult.stage === FeedStage.OK) {
      return lastResult;
    }

    if (!isRetryableFeedResult(lastResult)) {
      return lastResult;
    }

    if (attempt < maxAttempts) {
      await sleep(backoffMs * attempt);
    }
  }

  return lastResult!;
}

/**
 * Decode an already-fetched GTFS-RT body and classify the outcome.
 * A body that decodes but lacks a header timestamp is INVALID_FEED
 * (511.org serves error text with HTTP 200 when the key or params are bad,
 * which typically surfaces here as a decode failure, and a header-less
 * protobuf as INVALID_FEED).
 */
export function parseFeedStage(
  endpoint: string,
  body: ArrayBuffer,
  status: number | null,
  durationMs: number | null = null,
  attempts = 1,
  bytes: number | null = body.byteLength,
): FeedResult {
  let feed: ParsedFeed;
  try {
    feed = parseFeed(body);
  } catch (err) {
    const upstreamText = sniffAsciiText(body);
    const errorMsg = upstreamText
      ? `Protobuf decode failed (upstream text: "${upstreamText}")`
      : describe(err);
    return {
      endpoint,
      stage: FeedStage.PARSE_ERROR,
      status,
      durationMs,
      bytes: bytes ?? body.byteLength,
      attempts,
      error: errorMsg,
    };
  }

  if (!feed.t) {
    const upstreamText = sniffAsciiText(body);
    const errorMsg = upstreamText
      ? `Feed header missing (upstream text: "${upstreamText}")`
      : 'Feed header missing or timestamp is 0';
    return {
      endpoint,
      stage: FeedStage.INVALID_FEED,
      status,
      durationMs,
      bytes: bytes ?? body.byteLength,
      attempts,
      error: errorMsg,
    };
  }

  return {
    endpoint,
    stage: FeedStage.OK,
    status,
    durationMs,
    bytes: bytes ?? body.byteLength,
    attempts,
    feed,
  };
}

function describe(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  // Truncate defensively; messages can embed URLs or long library chains.
  return msg.slice(0, 200);
}
