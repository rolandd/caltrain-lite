// SPDX-License-Identifier: MIT
// Copyright 2026 Roland Dreier <roland@rolandd.dev>

import { parseFeed } from './gtfs-rt.js';

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
      const fetchFeed = async (endpoint: string) => {
        const resp = await fetch(`${baseUrl}/${endpoint}?api_key=${apiKey}&agency=${agency}`);
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

      // 3. Merge Vehicle Positions into Trip Updates
      const entities = tu.e;
      for (const entity of entities) {
        if (vp.p.has(entity.i)) {
          entity.p = vp.p.get(entity.i);
        }
      }

      // 4. Construct unified status
      // Use the latest timestamp from the feeds
      const t = Math.max(tu.t, vp.t, sa.t);

      const status = {
        t,
        e: entities,
        a: sa.a,
      };

      // Store in KV
      await env.TRANSIT_DATA.put('realtime:status', JSON.stringify(status), {
        expirationTtl: 180, // 3 minutes
      });

      console.log(`Updated RT: ${entities.length} trips, ${sa.a.length} alerts, ts=${t}`);
    } catch (err) {
      console.error('Error fetching/parsing GTFS-RT:', err);
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
      const data = await env.TRANSIT_DATA.get('realtime:status');
      if (!data) {
        return new Response('{"error": "No data"}', {
          status: 404,
          headers: { ...headers, 'Content-Type': 'application/json' },
        });
      }
      return new Response(data, {
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
