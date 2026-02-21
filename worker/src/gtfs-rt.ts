// SPDX-License-Identifier: MIT
// Copyright 2026 Roland Dreier <roland@rolandd.dev>

import Pbf from 'pbf';
import { readFeedMessage } from './gtfs-realtime.js';
import type { RealtimeEntity, VehiclePosition, ServiceAlert } from '@packages/types/schema';

export interface ParsedFeed {
  t: number;
  e: RealtimeEntity[];
  p: Map<string, VehiclePosition>;
  a: ServiceAlert[];
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
  const timestamp = Number(feed.header?.timestamp || 0);

  const e: RealtimeEntity[] = [];
  const positions = new Map<string, VehiclePosition>();
  const alerts: ServiceAlert[] = [];

  for (const entity of feed.entity ?? []) {
    // 1. Trip Update
    if (entity.trip_update) {
      const tu = entity.trip_update;
      const tripId = tu.trip?.trip_id;
      if (tripId) {
        let delay = 0;
        let stopId = '';

        if (tu.stop_time_update && tu.stop_time_update.length > 0) {
          const update = tu.stop_time_update[0];
          const event = update.departure || update.arrival;
          if (event && typeof event.delay === 'number') {
            delay = event.delay;
          }
          if (update.stop_id) {
            stopId = update.stop_id;
          }
        }

        const ent: RealtimeEntity = {
          i: tripId,
          s: stopId,
          st: 2, // Default to In Transit
        };
        if (delay !== 0) ent.d = delay;
        e.push(ent);
      }
    }

    // 2. Vehicle Position
    // (round lat/lon to no more than 5 digits past decimal point
    // because the RT feed has more but they imply false precision
    // and just waste bytes on the wire)
    if (entity.vehicle) {
      const v = entity.vehicle;
      const tripId = v.trip?.trip_id;
      if (tripId && v.position) {
        const la = Math.round(v.position.latitude * 100000) / 100000;
        const lo = Math.round(v.position.longitude * 100000) / 100000;
        if (!Number.isFinite(la) || !Number.isFinite(lo)) {
          continue;
        }

        const pos: VehiclePosition = {
          la,
          lo,
        };
        if (v.position.bearing) pos.b = v.position.bearing;
        if (v.position.speed) pos.sp = v.position.speed;

        positions.set(tripId, pos);
      }
    }

    // 3. Service Alert
    if (entity.alert) {
      const a = entity.alert;

      alerts.push({
        h: extractTranslation(a.header_text),
        d: extractTranslation(a.description_text),
        c: a.cause ? String(a.cause) : undefined,
        e: a.effect ? String(a.effect) : undefined,
        s: a.informed_entity?.map((e: GtfsInformedEntity) => e.stop_id).filter(Boolean),
        st: a.active_period?.[0]?.start ? Number(a.active_period[0].start) : undefined,
        en: a.active_period?.[0]?.end ? Number(a.active_period[0].end) : undefined,
      });
    }
  }

  return { t: timestamp, e, p: positions, a: alerts };
}
