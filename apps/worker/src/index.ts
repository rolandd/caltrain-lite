import { parseRealtimeStatus } from './gtfs-rt.js';

export interface Env {
    TRANSIT_511_API_KEY: string;
    TRANSIT_DATA: KVNamespace;
}

export default {
    // CRON TRIGGER: Fetch from 511.org -> Parse -> KV
    async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
        const apiKey = env.TRANSIT_511_API_KEY;
        if (!apiKey) {
            console.error('Missing TRANSIT_511_API_KEY');
            return;
        }

        try {
            // 1. Fetch TripUpdates (and ServiceAlerts? 511 has separate feeds.
            // User only asked for "fetching GTFS-RT data", usually implying TripUpdates.
            // But schema includes alerts. We might need two fetches.
            // For prototype, let's start with TripUpdates.
            const url = `http://api.511.org/Transit/TripUpdates?api_key=${apiKey}&agency=CT`;
            const resp = await fetch(url);
            if (!resp.ok) throw new Error(`Fetch failed: ${resp.status}`);

            const buffer = await resp.arrayBuffer();
            const status = parseRealtimeStatus(buffer);

            // Store in KV
            await env.TRANSIT_DATA.put('realtime:status', JSON.stringify(status), {
                expirationTtl: 180 // 3 minutes (allows for 1 min cron jitter/latency)
            });

            console.log(`Updated realtime status: ${status.entities.length} trips, ${status.alerts.length} alerts`);

        } catch (err) {
            console.error('Error fetching/parsing GTFS-RT:', err);
        }
    },

    // HTTP: Serve from KV
    async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
        const url = new URL(request.url);

        if (url.pathname === '/api/realtime') {
            const data = await env.TRANSIT_DATA.get('realtime:status');
            if (!data) {
                return new Response('{"error": "No data"}', {
                    status: 404,
                    headers: { 'Content-Type': 'application/json' }
                });
            }
            return new Response(data, {
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*', // Allow local/dev access
                    'Cache-Control': 'no-cache'
                }
            });
        }

        return new Response('Not found', { status: 404 });
    }
};
