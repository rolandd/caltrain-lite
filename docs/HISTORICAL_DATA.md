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

## 2. Processed Performance Data (`performance:data`)

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

## 3. Monotonic Regression & Archival Lifecycle

### Pool Adjacent Violators Algorithm (PAVA)

Observed travel times across stops are processed using **Isotonic Regression** (PAVA) to guarantee that expected arrival times across stop sequences are strictly non-decreasing ($t_{i+1} \ge t_i + \text{dwellSec}$).

### Database Compaction & Git Archival

- **90-Day Rolling Window**: Daily GHA workflow prunes raw records older than 90 days (`DELETE FROM train_locations WHERE timestamp < 90_days_ago`).
- **Daily Archival**: Raw daily snapshot rows are exported and compressed into `data/history/YYYY/YYYY-MM-DD.json.gz` (gzipped NDJSON, ~300-500 KB/day) and committed to the repository, preserving full historical precision for analytical tasks while keeping D1 compact.
