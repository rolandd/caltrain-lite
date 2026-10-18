// SPDX-License-Identifier: MIT
// Copyright 2026 Roland Dreier <roland@rolandd.dev>

import { buildRealtimeStatus } from './gtfs-rt';
import {
  fetchFeedStage,
  emptyParsedFeed,
  FeedStage,
  FEED_STAGE_NAMES,
  type FeedResult,
} from './feed-poll';
import { redact } from '../../packages/utils/redact';

export interface Env {
  TRANSIT_511_API_KEY: string;
  TRANSIT_DATA: KVNamespace;
  TRANSIT_DB: D1Database;
}

const ALLOWED_METHODS = 'GET, HEAD, OPTIONS';

const securityHeaders = {
  'Content-Security-Policy':
    "default-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'none'",
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
  'Permissions-Policy':
    'camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=(), autoplay=(), fullscreen=(self)',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Cross-Origin-Resource-Policy': 'same-origin',
};

const FEED_TIMEOUT_MS = 4000; // 4s timeout per attempt (allows 3 attempts within CF 30s limit)
const FEED_MAX_ATTEMPTS = 3;
const FEED_RETRY_BACKOFF_MS = 300;
const MAX_POLL_ERROR_CHARS = 500;

/**
 * CRON TRIGGER: Fetch from 511.org -> Parse -> KV & D1
 *
 * Every tick writes exactly one feed_polls row recording what happened at
 * each pipeline layer (fetch / HTTP / body / parse / header), regardless of
 * success or failure. Absence of a row for an expected tick therefore means
 * our own infra failed, not the data source. Each feed is fetched and
 * classified independently, so one broken feed cannot mask another's
 * outcome; the KV snapshot itself remains all-or-nothing.
 */
async function runPoll(env: Env, apiKey: string | undefined): Promise<void> {
  const polledAt = Math.floor(Date.now() / 1000);
  const baseUrl = 'https://api.511.org/Transit';
  const agency = 'CT';

  // 1. Fetch + parse each feed independently; never throws.
  let tu: FeedResult;
  let vp: FeedResult;
  let sa: FeedResult;
  if (!apiKey) {
    console.error('Missing TRANSIT_511_API_KEY');
    const configError = 'Missing TRANSIT_511_API_KEY';
    tu = {
      endpoint: 'TripUpdates',
      stage: FeedStage.FETCH_ERROR,
      status: null,
      durationMs: null,
      bytes: null,
      attempts: 0,
      error: configError,
    };
    vp = {
      endpoint: 'VehiclePositions',
      stage: FeedStage.FETCH_ERROR,
      status: null,
      durationMs: null,
      bytes: null,
      attempts: 0,
      error: configError,
    };
    sa = {
      endpoint: 'ServiceAlerts',
      stage: FeedStage.FETCH_ERROR,
      status: null,
      durationMs: null,
      bytes: null,
      attempts: 0,
      error: configError,
    };
  } else {
    const feedUrl = (endpoint: string) => {
      const url = new URL(`${baseUrl}/${endpoint}`);
      url.searchParams.set('api_key', apiKey);
      url.searchParams.set('agency', agency);
      return url.toString();
    };

    [tu, vp, sa] = await Promise.all([
      fetchFeedStage(
        'TripUpdates',
        feedUrl('TripUpdates'),
        FEED_TIMEOUT_MS,
        FEED_MAX_ATTEMPTS,
        FEED_RETRY_BACKOFF_MS,
      ),
      fetchFeedStage(
        'VehiclePositions',
        feedUrl('VehiclePositions'),
        FEED_TIMEOUT_MS,
        FEED_MAX_ATTEMPTS,
        FEED_RETRY_BACKOFF_MS,
      ),
      fetchFeedStage(
        'ServiceAlerts',
        feedUrl('ServiceAlerts'),
        FEED_TIMEOUT_MS,
        FEED_MAX_ATTEMPTS,
        FEED_RETRY_BACKOFF_MS,
      ),
    ]);
  }

  // 2. Construct unified status (empty stand-ins for failed feeds; used for
  // D1 recording and, when all feeds succeeded, the KV snapshot).
  const status = buildRealtimeStatus(
    tu.feed ?? emptyParsedFeed(),
    vp.feed ?? emptyParsedFeed(),
    sa.feed ?? emptyParsedFeed(),
  );
  const numTrips = Object.keys(status.byTrip).length;

  let vehicleCount = 0;
  let vehicleMovingCount = 0;
  for (const trip of Object.values(status.byTrip)) {
    if (trip.p) {
      vehicleCount++;
      if (trip.p.sp && trip.p.sp > 0) vehicleMovingCount++;
    }
  }

  const tuTimestamp = tu.feed?.t && tu.feed.t > 0 ? tu.feed.t : null;
  const vpTimestamp = vp.feed?.t && vp.feed.t > 0 ? vp.feed.t : null;
  const saTimestamp = sa.feed?.t && sa.feed.t > 0 ? sa.feed.t : null;
  const trainDataTimestamp = Math.max(tu.feed?.t ?? 0, vp.feed?.t ?? 0);
  const allFeedsOk =
    tu.stage === FeedStage.OK && vp.stage === FeedStage.OK && sa.stage === FeedStage.OK;

  // 3. Store in KV (all-or-nothing: the client derives freshness from status.t
  // alone and cannot detect a partial snapshot, so serving a fresh-but-incomplete
  // status with a Live badge would be worse than serving the last complete one
  // as it ages out) and record train locations in D1 (all-or-nothing as well:
  // the performance pipeline expects complete snapshots — p-only records from
  // a TripUpdates outage would be ingested as zero-delay observations — and
  // pre-telemetry behavior skipped this write unless every feed succeeded).
  // Partial outcomes are still fully recorded in feed_polls for the health
  // dashboard, which reads D1, not KV.
  // TODO(phase 3): signal degraded/partial state to clients (e.g. via
  // realtime:health KV + /api/health/current) before revisiting partial serving.
  let kvWritten = false;
  let locationsWritten = false;
  const writes: Promise<void>[] = [];
  if (allFeedsOk) {
    writes.push(
      env.TRANSIT_DATA.put('realtime:status', JSON.stringify(status), {
        expirationTtl: 180, // 3 minutes
        metadata: { t: status.t },
      }).then(
        () => {
          kvWritten = true;
        },
        (err) => {
          console.error('KV put failed:', redact(String(err), apiKey));
        },
      ),
    );
  }
  if (allFeedsOk && numTrips > 0 && trainDataTimestamp > 0) {
    writes.push(
      env.TRANSIT_DB.prepare('INSERT INTO train_locations (timestamp, data) VALUES (?, ?)')
        .bind(trainDataTimestamp, JSON.stringify(status.byTrip))
        .run()
        .then(
          () => {
            locationsWritten = true;
          },
          (err) => {
            console.error('train_locations insert failed:', redact(String(err), apiKey));
          },
        ),
    );
  }
  await Promise.all(writes);

  // 4. Always record the poll outcome. This must never be skipped and never
  // throw: if this insert fails, the missing row is itself the signal that
  // our infra (not 511.org) is unhealthy.
  const errors = [tu, vp, sa].filter((r) => r.error).map((r) => `${r.endpoint}: ${r.error}`);
  const errorStr = errors.length
    ? redact(errors.join(' | '), apiKey).slice(0, MAX_POLL_ERROR_CHARS)
    : null;

  try {
    await env.TRANSIT_DB.prepare(
      `INSERT INTO feed_polls
        (polled_at, tu_stage, vp_stage, sa_stage,
         tu_status, vp_status, sa_status,
         tu_duration_ms, vp_duration_ms, sa_duration_ms,
         tu_bytes, vp_bytes, sa_bytes,
         tu_timestamp, vp_timestamp, sa_timestamp,
         tu_attempts, vp_attempts, sa_attempts,
         trip_count, vehicle_count, vehicle_moving_count, alert_count,
         kv_written, locations_written, error)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        polledAt,
        tu.stage,
        vp.stage,
        sa.stage,
        tu.status,
        vp.status,
        sa.status,
        tu.durationMs,
        vp.durationMs,
        sa.durationMs,
        tu.bytes,
        vp.bytes,
        sa.bytes,
        tuTimestamp,
        vpTimestamp,
        saTimestamp,
        tu.attempts,
        vp.attempts,
        sa.attempts,
        numTrips,
        vehicleCount,
        vehicleMovingCount,
        status.a.length,
        kvWritten ? 1 : 0,
        locationsWritten ? 1 : 0,
        errorStr,
      )
      .run();
  } catch (err) {
    console.error('feed_polls insert failed:', redact(String(err), apiKey));
  }

  console.log(
    `Poll@${polledAt}:` +
      ` TU=${FEED_STAGE_NAMES[tu.stage]}(${tu.status ?? '-'}, ${tu.durationMs ?? '-'}ms, ${tu.bytes ?? '-'}B, try=${tu.attempts})` +
      ` VP=${FEED_STAGE_NAMES[vp.stage]}(${vp.status ?? '-'}, ${vp.durationMs ?? '-'}ms, ${vp.bytes ?? '-'}B, try=${vp.attempts})` +
      ` SA=${FEED_STAGE_NAMES[sa.stage]}(${sa.status ?? '-'}, ${sa.durationMs ?? '-'}ms, ${sa.bytes ?? '-'}B, try=${sa.attempts})` +
      ` trips=${numTrips} vehicles=${vehicleCount} moving=${vehicleMovingCount}` +
      ` alerts=${status.a.length} tu_ts=${tuTimestamp ?? '-'} vp_ts=${vpTimestamp ?? '-'} sa_ts=${saTimestamp ?? '-'}` +
      ` kv=${kvWritten ? 1 : 0} loc=${locationsWritten ? 1 : 0}`,
  );
}

export default {
  // CRON TRIGGER: Fetch from 511.org -> Parse -> KV & D1
  async scheduled(event: ScheduledEvent, env: Env, _ctx: ExecutionContext): Promise<void> {
    try {
      await runPoll(env, env.TRANSIT_511_API_KEY);
    } catch (err) {
      // Last-resort guard: runPoll is designed not to throw, but if anything
      // unexpected escapes we must never crash the scheduled handler silently.
      console.error(
        'Unexpected error in scheduled poll:',
        redact(
          err instanceof Error ? err.stack || err.message : String(err),
          env.TRANSIT_511_API_KEY,
        ),
      );
    }
  },

  // HTTP: Serve from KV

  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          ...securityHeaders,
          Allow: ALLOWED_METHODS,
        },
      });
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
        status: 405,
        headers: {
          ...securityHeaders,
          'Content-Type': 'application/json',
          Allow: ALLOWED_METHODS,
        },
      });
    }

    const url = new URL(request.url);

    const headers = securityHeaders;

    if (url.pathname === '/api/schedule') {
      const data = await env.TRANSIT_DATA.get('schedule:data', { type: 'stream' });
      if (!data) {
        return new Response(JSON.stringify({ error: 'No schedule data' }), {
          status: 404,
          headers: { ...headers, 'Content-Type': 'application/json' },
        });
      }
      return new Response(data, {
        headers: {
          ...headers,
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=3600', // 1 hour
        },
      });
    }

    if (url.pathname === '/api/v2/schedule') {
      const data =
        (await env.TRANSIT_DATA.get('schedule:v2:data', { type: 'stream' })) ||
        (await env.TRANSIT_DATA.get('schedule:data', { type: 'stream' }));
      if (!data) {
        return new Response(JSON.stringify({ error: 'No schedule data' }), {
          status: 404,
          headers: { ...headers, 'Content-Type': 'application/json' },
        });
      }
      return new Response(data, {
        headers: {
          ...headers,
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=3600', // 1 hour
        },
      });
    }

    if (url.pathname === '/api/meta') {
      const data = await env.TRANSIT_DATA.get('schedule:meta');
      if (!data) {
        return new Response(JSON.stringify({ error: 'No meta data' }), {
          status: 404,
          headers: { ...headers, 'Content-Type': 'application/json' },
        });
      }
      return new Response(data, {
        headers: {
          ...headers,
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=60', // 1 minute
        },
      });
    }

    if (url.pathname === '/api/v2/meta') {
      const data =
        (await env.TRANSIT_DATA.get('schedule:v2:meta')) ||
        (await env.TRANSIT_DATA.get('schedule:meta'));
      if (!data) {
        return new Response(JSON.stringify({ error: 'No meta data' }), {
          status: 404,
          headers: { ...headers, 'Content-Type': 'application/json' },
        });
      }
      return new Response(data, {
        headers: {
          ...headers,
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=60', // 1 minute
        },
      });
    }

    if (url.pathname === '/api/realtime') {
      const { value, metadata } = await env.TRANSIT_DATA.getWithMetadata<{ t: number }>(
        'realtime:status',
        { type: 'stream' },
      );
      if (!value) {
        return new Response('{"error": "No data"}', {
          status: 404,
          headers: { ...headers, 'Content-Type': 'application/json' },
        });
      }

      let etag: string | null = null;
      if (metadata?.t) {
        etag = `W/"${metadata.t}"`;
      }

      if (etag && request.headers.get('If-None-Match') === etag) {
        await value.cancel();
        return new Response(null, {
          status: 304,
          headers: {
            ...headers,
            'Cache-Control': 'public, max-age=30',
            ETag: etag,
          },
        });
      }

      const responseHeaders: Record<string, string> = {
        ...headers,
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=30',
      };
      if (etag) {
        responseHeaders.ETag = etag;
      }

      return new Response(value, {
        headers: responseHeaders,
      });
    }

    if (url.pathname === '/api/performance') {
      const data = await env.TRANSIT_DATA.get('performance:data', { type: 'stream' });
      if (!data) {
        return new Response(JSON.stringify({ error: 'No performance data' }), {
          status: 404,
          headers: { ...headers, 'Content-Type': 'application/json' },
        });
      }
      return new Response(data, {
        headers: {
          ...headers,
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=3600, s-maxage=86400', // 1 hour browser, 24 hours edge
        },
      });
    }

    return new Response('Not found', { status: 404, headers });
  },
};
