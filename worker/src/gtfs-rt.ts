// SPDX-License-Identifier: MIT
// Copyright 2026 Roland Dreier <roland@rolandd.dev>

import Pbf from 'pbf';
import { readFeedMessage } from './gtfs-realtime.js';
import type {
  RealtimeStatus,
  RealtimeTripStatus,
  VehiclePosition,
  ServiceAlert,
} from '@packages/types/schema';

interface ParsedTripEntity extends RealtimeTripStatus {
  i: string;
}

export interface ParsedFeed {
  t: number;
  e: ParsedTripEntity[];
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
  trip?: {
    trip_id?: string;
  };
}

/** Extract English text from a GTFS-RT TranslatedString. */
function extractTranslation(txt: GtfsTranslatedString | undefined): string {
  if (!txt?.translation) return '';
  for (const t of txt.translation) {
    if (t.language === 'en') return t.text;
  }
  return '';
}

export function parseFeed(buffer: ArrayBuffer): ParsedFeed {
  const pbf = new Pbf(new Uint8Array(buffer));
  const feed = readFeedMessage(pbf);
  const timestamp = Number(feed.header?.timestamp || 0);

  const e: ParsedTripEntity[] = [];
  const positions = new Map<string, VehiclePosition>();
  const alerts: ServiceAlert[] = [];

  const entities = feed.entity;
  if (!entities) return { t: timestamp, e, p: positions, a: alerts };

  for (let i = 0; i < entities.length; i++) {
    const entity = entities[i];
    // 1. Trip Update
    if (entity.trip_update) {
      const tu = entity.trip_update;
      const tripId = tu.trip?.trip_id;
      if (tripId) {
        let delay = 0;
        let time = 0;
        let stopId = '';

        if (tu.stop_time_update && tu.stop_time_update.length > 0) {
          const updates = tu.stop_time_update;

          // Prefer the first referenced stop as the active stop context.
          for (let j = 0; j < updates.length; j++) {
            if (updates[j].stop_id) {
              stopId = updates[j].stop_id;
              break;
            }
          }

          // Prefer the first non-zero stop-level delay; it is more specific than trip-level delay.
          for (let j = 0; j < updates.length; j++) {
            const update = updates[j];
            const event = update.departure || update.arrival;
            if (event) {
              if (event.delay !== 0 && delay === 0) {
                delay = event.delay;
                if (update.stop_id) {
                  stopId = update.stop_id;
                }
              }
              if (event.time !== 0 && time === 0) {
                time = event.time;
                if (update.stop_id) {
                  stopId = update.stop_id;
                }
              }
              if (delay !== 0 && time !== 0) break;
            }
          }
        }

        // Fall back to trip-level delay when no non-zero stop-level delay is available.
        if (delay === 0 && tu.delay !== 0) {
          delay = tu.delay;
        }

        const ent: ParsedTripEntity = {
          i: tripId,
          st: 2, // Default to In Transit
        };
        if (delay !== 0) ent.d = delay;
        if (time !== 0) ent.t = time;
        if (stopId) ent.s = stopId;
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
        if (Number.isFinite(la) && Number.isFinite(lo)) {
          const pos: VehiclePosition = {
            la,
            lo,
          };
          if (v.position.bearing) pos.b = v.position.bearing;
          if (v.position.speed) pos.sp = v.position.speed;

          positions.set(tripId, pos);
        }
      }
    }

    // 3. Service Alert
    if (entity.alert) {
      const a = entity.alert;

      let stops: string[] | undefined;
      let trips: string[] | undefined;

      if (a.informed_entity) {
        stops = [];
        trips = [];
        for (const ie of a.informed_entity) {
          if (ie.stop_id) stops.push(ie.stop_id);
          if (ie.trip?.trip_id) trips.push(ie.trip.trip_id);
        }
      }

      alerts.push({
        h: extractTranslation(a.header_text),
        d: extractTranslation(a.description_text),
        c: a.cause ? String(a.cause) : undefined,
        e: a.effect ? String(a.effect) : undefined,
        s: stops,
        tr: trips,
        st: a.active_period?.[0]?.start ? Number(a.active_period[0].start) : undefined,
        en: a.active_period?.[0]?.end ? Number(a.active_period[0].end) : undefined,
      });
    }
  }

  return { t: timestamp, e, p: positions, a: alerts };
}

/**
 * Build the unified realtime payload from parsed trip, vehicle, and alert feeds.
 */
export function buildRealtimeStatus(
  tripUpdates: ParsedFeed,
  vehiclePositions: ParsedFeed,
  serviceAlerts: ParsedFeed,
): RealtimeStatus {
  const byTrip: Record<string, RealtimeTripStatus> = {};

  for (const entity of tripUpdates.e) {
    const trip: RealtimeTripStatus = {};
    if (entity.d !== undefined) trip.d = entity.d;
    if (entity.t !== undefined) trip.t = entity.t;
    if (entity.s) trip.s = entity.s;
    if (entity.st !== undefined) trip.st = entity.st;

    const position = vehiclePositions.p.get(entity.i);
    if (position) {
      trip.p = position;
    }

    byTrip[entity.i] = trip;
  }

  return {
    t: Math.max(tripUpdates.t, vehiclePositions.t, serviceAlerts.t),
    byTrip,
    a: serviceAlerts.a,
  };
}
