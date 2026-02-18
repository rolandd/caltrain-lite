import Pbf from 'pbf';
import { readFeedMessage } from './gtfs-realtime.js';
import type { RealtimeStatus, TripUpdate, ServiceAlert } from '../../packages/types/schema.js';

export function parseRealtimeStatus(buffer: ArrayBuffer): RealtimeStatus {
    // 1. Decode PBF
    const pbf = new Pbf(new Uint8Array(buffer));
    const feed = readFeedMessage(pbf);

    const timestamp = Number(feed.header.timestamp);
    const entities: TripUpdate[] = [];
    const alerts: ServiceAlert[] = [];

    // 2. Transform entities
    for (const entity of feed.entity) {
        if (entity.trip_update) {
            const tu = entity.trip_update;
            const tripId = tu.trip.trip_id;

            // Find the relevant update (first stop time update often has the delay)
            // or the vehicle delay if available.
            // 511.org usually provides stop_time_update list.
            // We want the delay for the *current* situation.
            // If we have a stop_time_update, take the first one's delay?
            // Or explicitly looking for delay in stop_time_update.

            let delay = 0;
            let stopId = '';
            let status = 2; // In Transit (default)

            if (tu.stop_time_update && tu.stop_time_update.length > 0) {
                const update = tu.stop_time_update[0];
                // GTFS-RT delay is in seconds.
                // arrival or departure? usually departure delay for next stop.
                const event = update.departure || update.arrival;
                if (event && event.delay !== null) {
                    delay = event.delay;
                }
                stopId = update.stop_id;
            }

            // Map GTFS-RT status to our internal enum if needed (though our schema uses 0-2 too)
            // But we don't have vehicle position here usually for status.
            // If we don't have status from vehicle, we might infer?
            // For now, simple mapping.

            entities.push({
                id: tripId,
                delay,
                stop: stopId,
                status: 2 // Default to In Transit if unknown
            });
        }

        if (entity.alert) {
            const a = entity.alert;
            // Extract English text
            const header = a.header_text?.translation?.find((t: any) => t.language === 'en')?.text || '';
            const description = a.description_text?.translation?.find((t: any) => t.language === 'en')?.text || '';

            alerts.push({
                header,
                description,
                start: a.active_period?.[0]?.start ? Number(a.active_period[0].start) : undefined,
                end: a.active_period?.[0]?.end ? Number(a.active_period[0].end) : undefined,
                cause: String(a.cause), // Enum as string for now
                effect: String(a.effect),
                stops: a.informed_entity?.map((e: any) => e.stop_id).filter(Boolean)
            });
        }
    }

    return {
        u: timestamp,
        entities,
        alerts
    };
}
