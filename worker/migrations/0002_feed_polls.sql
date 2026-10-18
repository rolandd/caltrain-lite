-- Migration: Feed poll observability (511.org GTFS-RT health history)
-- Created at: 2026-10-17
--
-- One row per worker cron tick. A row is written on every tick — success,
-- partial failure, total failure, or empty feed — so that absence of a row
-- for an expected tick means our own infra failed (cron miss, worker crash,
-- or D1 unavailable), not a data source problem.
--
-- Stage codes (per feed; 0 = OK, > 0 = the layer at which the feed failed):
--   0 OK            fetched, HTTP 200, non-empty, parsed, valid header
--   1 FETCH_ERROR   fetch() threw (network, DNS, timeout) — no HTTP status
--   2 HTTP_ERROR    got a response but status was not 200
--   3 EMPTY_BODY    HTTP 200 but zero-byte body
--   4 PARSE_ERROR   protobuf decode threw
--   5 INVALID_FEED  decoded but missing required structure (header timestamp)

CREATE TABLE IF NOT EXISTS feed_polls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  polled_at INTEGER NOT NULL,        -- epoch seconds when the cron tick started
  tu_stage INTEGER NOT NULL,         -- TripUpdates pipeline stage (see above)
  vp_stage INTEGER NOT NULL,         -- VehiclePositions pipeline stage
  sa_stage INTEGER NOT NULL,         -- ServiceAlerts pipeline stage
  tu_status INTEGER,                 -- HTTP status; NULL if fetch failed first
  vp_status INTEGER,
  sa_status INTEGER,
  tu_duration_ms INTEGER,            -- TripUpdates fetch + parse duration in ms (excluding backoff sleep)
  vp_duration_ms INTEGER,            -- VehiclePositions fetch + parse duration in ms (excluding backoff sleep)
  sa_duration_ms INTEGER,            -- ServiceAlerts fetch + parse duration in ms (excluding backoff sleep)
  tu_bytes INTEGER,                  -- TripUpdates response payload size in bytes; NULL if fetch failed
  vp_bytes INTEGER,                  -- VehiclePositions response payload size in bytes
  sa_bytes INTEGER,                  -- ServiceAlerts response payload size in bytes
  tu_timestamp INTEGER,              -- TripUpdates GTFS-RT header timestamp; NULL if none
  vp_timestamp INTEGER,              -- VehiclePositions GTFS-RT header timestamp; NULL if none
  sa_timestamp INTEGER,              -- ServiceAlerts GTFS-RT header timestamp; NULL if none
  tu_attempts INTEGER NOT NULL DEFAULT 1, -- attempts made (1 = first try, >1 = retried)
  vp_attempts INTEGER NOT NULL DEFAULT 1,
  sa_attempts INTEGER NOT NULL DEFAULT 1,
  trip_count INTEGER,                -- trains in the feed (status.byTrip entities)
  vehicle_count INTEGER,             -- trains reporting a vehicle position
  vehicle_moving_count INTEGER,      -- positions with non-zero speed
  alert_count INTEGER,               -- service alerts
  kv_written INTEGER NOT NULL DEFAULT 0,       -- realtime:status KV put succeeded
  locations_written INTEGER NOT NULL DEFAULT 0, -- train_locations D1 insert ran
  error TEXT,                        -- redacted, truncated error details
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_feed_polls_polled ON feed_polls(polled_at);
