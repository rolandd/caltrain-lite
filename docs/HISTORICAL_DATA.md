# Historical Real-Time Data & On-Time Performance

This document describes the schema, storage, daily processing, and archival lifecycle for the historical real-time train telemetry stored in Cloudflare D1 and Cloudflare KV.

## 1. D1 Database Schema (`train_locations`)

Real-time train location snapshots are recorded every 2 minutes by the Cloudflare Worker cron trigger (`worker/src/index.ts`).

```sql
CREATE TABLE IF NOT EXISTS train_locations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp INTEGER NOT NULL,      -- GTFS-RT feed timestamp (epoch seconds)
  data TEXT NOT NULL,             -- JSON encoded status.byTrip dictionary
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_train_locations_timestamp ON train_locations(timestamp);
CREATE INDEX IF NOT EXISTS idx_train_locations_created ON train_locations(created_at);
```

### Row Data Payload (`data`)

The `data` column contains a JSON string representing `Record<string, RealtimeTripStatus>` keyed by Train Number (e.g., `"101"`):

```json
{
  "101": {
    "d": 120, // Delay in seconds (+: late, -: early, omitted if 0)
    "t": 1774284600, // Predicted arrival/departure epoch seconds for next stop
    "s": "70021", // GTFS stop_id of active/next stop
    "st": 2, // Stop status: 0 = Incoming, 1 = Stopped, 2 = In Transit
    "p": {
      // Vehicle position snapshot
      "la": 37.57943, // Latitude (rounded to 5 decimals)
      "lo": -122.34412, // Longitude (rounded to 5 decimals)
      "b": 145, // Bearing in degrees (optional)
      "sp": 24.5 // Speed in m/s (optional)
    }
  }
}
```

### Volume Metrics

- **Sampling Interval**: 2 minutes during operational hours (~05:00 to 01:00 PST).
- **Rows Per Day**: ~600 rows.
- **Payload Size**: ~5 KB – 15 KB per row.
- **Daily Ingestion**: ~6 MB / day (~180 MB / month).
- **90-Day Retention**: ~540 MB total (well within Cloudflare D1's 5 GB free tier limit).

---

## 2. Feed Poll Observability (`feed_polls`)

Every worker cron tick writes exactly one `feed_polls` row recording what
happened at each pipeline layer, regardless of success or failure. A row is
written on success, partial failure, total failure, and empty feed alike, so
**absence of a row for an expected tick means our own infra failed** (cron
miss, worker crash, or D1 unavailable) — not a 511.org problem. Each feed is
fetched and classified independently (`worker/src/feed-poll.ts`), so one
broken feed cannot mask another's outcome. The served `realtime:status` KV
snapshot remains all-or-nothing — the client derives freshness from
`status.t` alone and cannot detect a partial snapshot — while every partial
outcome is fully recorded here for the health dashboard, which reads D1.

```sql
CREATE TABLE IF NOT EXISTS feed_polls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  polled_at INTEGER NOT NULL,        -- epoch seconds when the cron tick started
  tu_stage INTEGER NOT NULL,         -- TripUpdates pipeline stage (see below)
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
  kv_written INTEGER NOT NULL DEFAULT 0,        -- realtime:status KV put succeeded
  locations_written INTEGER NOT NULL DEFAULT 0, -- train_locations D1 insert ran
  error TEXT,                        -- redacted, truncated error details
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_feed_polls_polled ON feed_polls(polled_at);
```

### Pipeline stage codes (per feed)

Ordered by pipeline depth; `0` means OK, `> 0` names the layer that failed:

| Code | Stage          | Meaning                                                         |
| ---- | -------------- | --------------------------------------------------------------- |
| 0    | `OK`           | fetched, HTTP 200, non-empty, parsed, valid header              |
| 1    | `FETCH_ERROR`  | `fetch()` threw (network, DNS, timeout) — no HTTP status exists |
| 2    | `HTTP_ERROR`   | got a response but status was not 200                           |
| 3    | `EMPTY_BODY`   | HTTP 200 but zero-byte body                                     |
| 4    | `PARSE_ERROR`  | protobuf decode threw                                           |
| 5    | `INVALID_FEED` | decoded but missing required structure (header timestamp 0)     |

Note: 511.org sometimes serves ASCII error text with HTTP 200. Depending on
the bytes, that body either decodes as an empty feed with `t = 0`
(`INVALID_FEED`) or throws on decode (`PARSE_ERROR`) — plain text tends to
decode silently, while JSON/HTML often throws. Either way the sniffed
upstream text in the `error` column identifies what 511.org actually sent.

### Volume metrics

- **Sampling Interval**: one row per 2-minute cron tick, around the clock.
- **Rows Per Day**: ~720 (~65k over the 90-day window).
- **Retention**: rows are pruned with the same 90-day window as
  `train_locations` in the daily `sync-performance` GHA.

## 3. Processed Performance Data (`performance:data`)

A daily GitHub Action (`.github/workflows/sync-performance.yml`) processes observed D1 records over a rolling 90-day window to generate a monotonic on-time performance profile for each train.

### Schema (`TrainPerformanceProfile`)

Stored in Cloudflare KV as `performance:data` and served to clients via `GET /api/performance`:

```typescript
export interface TrainPerformanceProfile {
  trips: Record<string, TripPerformance>;
  legDistances?: Record<string, number>;
  meta: {
    generatedAt: number; // Epoch seconds
    windowDays: number; // Rolling sample window (e.g. 90)
    sampleSize: number; // Number of completed trip runs processed
  };
}

export interface TripPerformance {
  stops: Record<string, StopPerformance>;
  legs?: Record<string, LegPerformance>;
}

export interface StopPerformance {
  p50Delay: number; // Median arrival delay (seconds)
  p90Delay: number; // 90th percentile delay (seconds)
  dwellSec: number; // Median dwell duration (seconds)
}

export interface LegPerformance {
  medianTravelSec: number; // Median leg travel time (seconds)
  p90TravelSec: number; // 90th percentile travel time (seconds)
  medianSpeedMS: number; // Median velocity (m/s)
}
```

---

## 4. Monotonic Regression & Archival Lifecycle

### Pool Adjacent Violators Algorithm (PAVA)

Observed travel times across stops are processed using **Isotonic Regression** (PAVA) to guarantee that expected arrival times across stop sequences are strictly non-decreasing ($t_{i+1} \ge t_i + \text{dwellSec}$).

### Database Compaction & Git Archival

- **90-Day Rolling Window**: Daily GHA workflow prunes raw records older than 90 days (`DELETE FROM train_locations WHERE timestamp < 90_days_ago`).
- **Daily Archival**: Raw daily snapshot rows are exported and compressed into `data/history/YYYY/YYYY-MM-DD.json.gz` (gzipped NDJSON, ~300-500 KB/day) and committed to the repository, preserving full historical precision for analytical tasks while keeping D1 compact.
