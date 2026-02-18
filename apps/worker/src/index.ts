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
      const baseUrl = 'http://api.511.org/Transit';
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
      const entities = tu.entities;
      for (const entity of entities) {
        if (vp.positions.has(entity.id)) {
          entity.position = vp.positions.get(entity.id);
        }
      }

      // 4. Construct unified status
      // Use the latest timestamp from the feeds
      const timestamp = Math.max(tu.timestamp, vp.timestamp, sa.timestamp);

      const status = {
        timestamp,
        entities,
        alerts: sa.alerts,
      };

      // Store in KV
      await env.TRANSIT_DATA.put('realtime:status', JSON.stringify(status), {
        expirationTtl: 180, // 3 minutes
      });

      console.log(
        `Updated RT: ${entities.length} trips, ${sa.alerts.length} alerts, ts=${timestamp}`,
      );
    } catch (err) {
      console.error('Error fetching/parsing GTFS-RT:', err);
    }
  },

  // HTTP: Serve from KV
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/api/realtime') {
      const data = await env.TRANSIT_DATA.get('realtime:status');
      if (!data) {
        return new Response('{"error": "No data"}', {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(data, {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*', // Allow local/dev access
          'Cache-Control': 'no-cache',
        },
      });
    }

    return new Response('Not found', { status: 404 });
  },
};
