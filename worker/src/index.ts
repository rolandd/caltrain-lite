// SPDX-License-Identifier: MIT
// Copyright 2026 Roland Dreier <roland@rolandd.dev>

import { parseFeed, buildRealtimeStatus } from './gtfs-rt.js';

export interface Env {
  TRANSIT_511_API_KEY: string;
  TRANSIT_DATA: KVNamespace;
}

export default {
  // CRON TRIGGER: Fetch from 511.org -> Parse -> KV
  async scheduled(event: ScheduledEvent, env: Env, _ctx: ExecutionContext): Promise<void> {
    const apiKey = env.TRANSIT_511_API_KEY;
    if (!apiKey) {
      console.error('Missing TRANSIT_511_API_KEY');
      return;
    }

    try {
      // 1. Fetch TripUpdates, VehiclePositions, ServiceAlerts in parallel
      const baseUrl = 'https://api.511.org/Transit';
      const agency = 'CT';
      const signal = AbortSignal.timeout(10000); // 10s timeout for all fetches
      const fetchFeed = async (endpoint: string) => {
        const url = new URL(`${baseUrl}/${endpoint}`);
        url.searchParams.set('api_key', apiKey);
        url.searchParams.set('agency', agency);

        const resp = await fetch(url.toString(), {
          signal,
        });
        if (!resp.ok) throw new Error(`${endpoint}: ${resp.status}`);
        return resp.arrayBuffer();
      };

      const [tuBuf, vpBuf, saBuf] = await Promise.all([
        fetchFeed('TripUpdates'),
        fetchFeed('VehiclePositions'),
        fetchFeed('ServiceAlerts'),
      ]);

      // 2. Parse feeds
      const tu = parseFeed(tuBuf);
      const vp = parseFeed(vpBuf);
      const sa = parseFeed(saBuf);

      // 3. Construct unified status.
      const status = buildRealtimeStatus(tu, vp, sa);

      // Store in KV
      await env.TRANSIT_DATA.put('realtime:status', JSON.stringify(status), {
        expirationTtl: 180, // 3 minutes
        metadata: { t: status.t },
      });

      console.log(
        `Updated RT: ${Object.keys(status.byTrip).length} trips, ${status.a.length} alerts, ts=${status.t}`,
      );
    } catch (err) {
      // Redact API key from error logs
      const errStr = err instanceof Error ? err.stack || err.message : String(err);
      let redacted = errStr;
      if (apiKey) {
        redacted = redacted.replaceAll(apiKey, 'REDACTED');
        const encodedKey = encodeURIComponent(apiKey);
        if (encodedKey !== apiKey) {
          redacted = redacted.replaceAll(encodedKey, 'REDACTED');
        }
      }
      console.error('Error fetching/parsing GTFS-RT:', redacted);
    }
  },

  // HTTP: Serve from KV

  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
      Vary: 'Origin',
    };

    const securityHeaders = {
      'Content-Security-Policy':
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self' https://fonts.gstatic.com; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'self'; form-action 'none'",
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

    const headers = { ...corsHeaders, ...securityHeaders };

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers,
      });
    }

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

    if (url.pathname === '/api/realtime') {
      const { value, metadata } = await env.TRANSIT_DATA.getWithMetadata<{ t?: number }>(
        'realtime:status',
      );
      if (!value) {
        return new Response('{"error": "No data"}', {
          status: 404,
          headers: { ...headers, 'Content-Type': 'application/json' },
        });
      }

      if (metadata?.t) {
        const etag = `W/"${metadata.t}"`;
        if (request.headers.get('If-None-Match') === etag) {
          return new Response(null, {
            status: 304,
            headers: {
              ...headers,
              'Cache-Control': 'public, max-age=30',
              ETag: etag,
            },
          });
        }
        return new Response(value, {
          headers: {
            ...headers,
            'Content-Type': 'application/json',
            'Cache-Control': 'public, max-age=30',
            ETag: etag,
          },
        });
      }

      return new Response(value, {
        headers: {
          ...headers,
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=30',
        },
      });
    }

    return new Response('Not found', { status: 404, headers });
  },
};
