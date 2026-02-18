import Pbf from 'pbf';
import { readFeedMessage } from './gtfs-realtime.js';
import type { RealtimeEntity, VehiclePosition, ServiceAlert } from '@packages/types/schema';

export interface ParsedFeed {
  timestamp: number;
  entities: RealtimeEntity[];
  positions: Map<string, VehiclePosition>;
  alerts: ServiceAlert[];
}

/** Minimal types for protobuf-parsed GTFS-RT alert structures. */
interface GtfsTranslation {
  text: string;
  language: string;
}

interface GtfsTranslatedString {
  translation?: GtfsTranslation[];
}

interface GtfsInformedEntity {
  stop_id?: string;
}

/** Extract English text from a GTFS-RT TranslatedString. */
function extractTranslation(txt: GtfsTranslatedString | undefined): string {
  return txt?.translation?.find((t) => t.language === 'en')?.text || '';
}

export function parseFeed(buffer: ArrayBuffer): ParsedFeed {
  const pbf = new Pbf(new Uint8Array(buffer));
  const feed = readFeedMessage(pbf);
  const timestamp = Number(feed.header.timestamp || 0);

  const entities: RealtimeEntity[] = [];
  const positions = new Map<string, VehiclePosition>();
  const alerts: ServiceAlert[] = [];

  for (const entity of feed.entity) {
    // 1. Trip Update
    if (entity.trip_update) {
      const tu = entity.trip_update;
      const tripId = tu.trip.trip_id;
      let delay = 0;
      let stopId = '';

      if (tu.stop_time_update && tu.stop_time_update.length > 0) {
        const update = tu.stop_time_update[0];
        const event = update.departure || update.arrival;
        if (event && event.delay !== null) {
          delay = event.delay;
        }
        stopId = update.stop_id;
      }

      entities.push({
        id: tripId,
        delay,
        stop: stopId, // Note: This might be string or number in raw data, schema expects string
        status: 2, // Default to In Transit
      });
    }

    // 2. Vehicle Position
    if (entity.vehicle) {
      const v = entity.vehicle;
      if (v.trip && v.position) {
        positions.set(v.trip.trip_id, {
          lat: v.position.latitude,
          lon: v.position.longitude,
          bearing: v.position.bearing,
          speed: v.position.speed,
        });
      }
    }

    // 3. Service Alert
    if (entity.alert) {
      const a = entity.alert;

      alerts.push({
        header: extractTranslation(a.header_text),
        description: extractTranslation(a.description_text),
        cause: a.cause ? String(a.cause) : undefined,
        effect: a.effect ? String(a.effect) : undefined,
        stops: a.informed_entity
          ?.map((e: GtfsInformedEntity) => e.stop_id)
          .filter(Boolean),
        start: a.active_period?.[0]?.start ? Number(a.active_period[0].start) : undefined,
        end: a.active_period?.[0]?.end ? Number(a.active_period[0].end) : undefined,
      });
    }
  }

  return { timestamp, entities, positions, alerts };
}
