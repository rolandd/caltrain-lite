# System Architecture

## Overview

The system is built on an "Offline-First, Real-Time Second"
philosophy, specifically optimized for Smartphone/Mobile use and
designed for Open Source distribution.

**The Core:** SvelteKit 5 SPA / PWA reading from IndexedDB. The SPA
and all static assets are served from Cloudflare Pages.

**The Telemetry:** Cloudflare Worker (TypeScript) fetching binary
GTFS-RT from 511.org, decoding via pbf, and storing in Cloudflare KV.

**The Schedule Processor (GitHub Action):** Node.js/TypeScript script
that daily fetches the static GTFS ZIP from 511.org, parses it into a
compact Date-Aware Bundle with canonical station mappings, and uploads
to KV.

**The Contract:** Shared TypeScript interfaces (defined below) ensure
consistent communication between the GHA, Worker, and PWA.

### Data Flow

```
┌──────────────────────────────────────────────────────────────────┐
│                         GitHub Action                            │
│  (daily cron: fetch GTFS ZIP from 511.org, parse, upload)        │
│                                                                  │
│  511.org/transit/datafeeds?operator_id=CT ──► StaticSchedule     │
│                                               JSON bundle (<100KB)
└──────────────────┬───────────────────────────────────────────────┘
                   │ upload to KV
                   ▼
┌──────────────────────────────┐
│  Cloudflare KV               │
│  schedule:data  (<100KB)     │
│  schedule:meta  (~100B)      │
│  realtime:status (~5KB)      │
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────────────────────────────┐
│  Cloudflare Worker  (/api/realtime, /api/meta)       │
│                                                      │
│  Cron trigger (every 120s):                          │
│    511.org GTFS-RT (protobuf) ──► decode ──► KV      │
│                                                      │
│  GET /api/schedule → read KV → StaticSchedule JSON   │
│  GET /api/realtime → read KV → RealtimeStatus JSON   │
│  GET /api/meta     → read KV → ScheduleMeta JSON     │
└──────────────────────────────────────────────────────┘
               ▲
               │ fetch
┌──────────────┴───────────────────────────────────────┐
│  SvelteKit 5 SPA / PWA  (Cloudflare Pages)           │
│                                                      │
│  IndexedDB (Dexie) ◄── StaticSchedule                │
│  UI ◄── merged schedule + real-time                  │
│  localStorage ◄── favorite pairs, preferences        │
└──────────────────────────────────────────────────────┘
```

## Data Sources

All transit data comes from the **[511.org SF Bay Open Data API](https://511.org/open-data)**
(MTC-sanctioned). A single API key provides access to both static and
real-time feeds. Using one source avoids version skew between trip IDs
in the schedule and real-time data.

| Feed                     | Endpoint                                                       | Format   |
| ------------------------ | -------------------------------------------------------------- | -------- |
| Static GTFS (schedule)   | `api.511.org/transit/datafeeds?api_key={key}&operator_id=CT`   | ZIP      |
| Trip Updates (real-time) | `api.511.org/Transit/TripUpdates?api_key={key}&agency=CT`      | Protobuf |
| Vehicle Positions        | `api.511.org/Transit/VehiclePositions?api_key={key}&agency=CT` | Protobuf |
| Service Alerts           | `api.511.org/Transit/ServiceAlerts?api_key={key}&agency=CT`    | Protobuf |

The API key is stored as `TRANSIT_511_API_KEY` in GitHub Actions
secrets, Cloudflare Worker secrets, and locally in the gitignored
`API_KEY` file.

## Storage Architecture

All server-side storage uses **Cloudflare KV**. The parsed schedule
bundle is <100KB and the real-time status covers only today's trains,
making KV's 25MB value limit and low-latency reads an ideal fit.

| KV Key            | Contents                                  | Size   | Written By    |
| ----------------- | ----------------------------------------- | ------ | ------------- |
| `schedule:data`   | StaticSchedule JSON (full bundle)         | <100KB | GitHub Action |
| `schedule:meta`   | ScheduleMeta JSON (version + timestamps)  | ~100B  | GitHub Action |
| `realtime:status` | RealtimeStatus JSON (today's trains only) | ~5KB   | Worker cron   |

| Client Store      | Contents                            | Purpose                       |
| ----------------- | ----------------------------------- | ----------------------------- |
| IndexedDB (Dexie) | Cached StaticSchedule               | Offline-first schedule access |
| localStorage      | Favorite station pairs, preferences | Persist across sessions       |

## Shared Data Schemas (The Contract)

The following interfaces are the source of truth. The authoritative
copy is checked in as `packages/types/schema.d.ts`.

### Static Schedule Bundle (StaticSchedule)

Generated by GitHub Action → Stored in KV → Ingested by PWA into IndexedDB.

```typescript
interface StaticSchedule {
  m: {
    // Metadata
    v: string; // Version hash (SHA-256 of source ZIP)
    e: number; // Max End Date (YYYYMMDD integer)
    sv: number; // Schema version
  };
  p: Record<string, string[]>; // Patterns: { "p1": ["70011", "70021", ...] }
  t: Array<{
    // Trips
    i: string; // Trip ID (Train Number)
    s: string; // Service ID
    p: string; // Pattern ID reference
    d: 0 | 1; // Direction: 0 = Northbound, 1 = Southbound
    st: number[]; // Stop Times: [arr0, dep0, arr1, dep1, ...]
    // minutes from midnight; arr === dep when dwell is 0
    rt: string; // Route type (e.g. "Local", "Limited", "Bullet")
  }>;
  r: {
    // Service Rules
    c: Record<
      string,
      {
        // Calendar
        days: (0 | 1)[]; // [mon, tue, wed, thu, fri, sat, sun]
        start: number; // YYYYMMDD
        end: number; // YYYYMMDD
      }
    >;
    e: Record<string, { date: number; type: 1 | 2 }[]>; // Exceptions by Service ID
  };
  s: Record<
    string,
    {
      // Canonical Stations
      n: string; // Human name ("Menlo Park")
      z: string; // Fare zone ID
      ids: string[]; // GTFS stop_ids mapping to this station
      lat: number; // Latitude
      lon: number; // Longitude
    }
  >;
  f: {
    // Fare rules
    zones: Record<string, { name: string }>; // Zone metadata
    fares: Record<string, number>; // Price lookup: "originZone->destZone" -> cents
  };
  x: Record<string, string[]>; // Station-pair index: { "70011→70021": ["trip1", "trip2"] }
  // Precomputed for O(1) origin→destination lookup
  o: string[]; // Ordered list of canonical station IDs (North-to-South)
}
```

**Fare calculation:** Fares are looked up directly from the `f.fares`
table using the key `"<originZoneId>→<destZoneId>"`. This provides the
price in cents.

### Real-Time Status (RealtimeStatus)

Generated by Cloudflare Worker → Fetched by PWA.

```typescript
interface RealtimeStatus {
  t: number; // Feed timestamp (epoch seconds)
  byTrip: Record<
    string,
    {
      // Keyed by Trip ID
      d?: number; // Delay in seconds
      t?: number; // Predicted time for the next stop (epoch seconds)
      s?: string; // Current/Next Stop ID
      st?: number; // 0: Incoming, 1: Stopped, 2: In Transit
      p?: {
        // Vehicle Position
        la: number; // Latitude
        lo: number; // Longitude
        b?: number; // Bearing
        sp?: number; // Speed
      };
    }
  >;
  a: Array<{
    // Service Alerts
    h: string; // Header
    d: string; // Description
    c?: string; // Cause
    e?: string; // Effect
    s?: string[]; // Affected stop IDs
    tr?: string[]; // Linked trip IDs
    st?: number; // Start time
    en?: number; // End time
  }>;
}
```

### Schedule Metadata (ScheduleMeta)

Returned by Worker `GET /api/meta`. Allows PWA to check freshness without downloading the full bundle.

```typescript
interface ScheduleMeta {
  v: string; // Current schedule version hash
  e: number; // Max end date (YYYYMMDD)
  sv: number; // Schema version
}
```

## Design Decisions

| Decision           | Choice                                  | Rationale                                                                                                    |
| ------------------ | --------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Favorites          | **Core UX, not secondary**              | Fastest access guides the design; landing screen is favorites                                                |
| Push notifications | Not in v1                               | Passive pull-to-refresh is sufficient initially                                                              |
| Fare display       | Included                                | Zone-based fare calculated from `f` rules + station zones                                                    |
| Accessibility      | **WCAG AA minimum, AAA where possible** | High contrast (dark mode helps), 44px+ touch targets, semantic HTML, ARIA labels, screen reader tested       |
| Analytics          | None                                    | Privacy-first; debuggability via structured console logging + Cloudflare Worker analytics (built-in, no PII) |
| Install prompt     | Browser-aware strategy (see below)      | Native feel on Chromium; instructional fallback on Firefox/Safari                                            |

### PWA Install Prompt Strategy

A **browser-aware** approach that gives the most native experience on each platform:

| Browser                                              | `beforeinstallprompt` | Native Install UI                | Our Strategy                                                  |
| ---------------------------------------------------- | --------------------- | -------------------------------- | ------------------------------------------------------------- |
| Chrome / Edge / Samsung Internet (Android & desktop) | ✅                    | Auto mini-infobar + programmatic | Intercept `beforeinstallprompt`, show custom in-app banner    |
| Firefox Android                                      | ❌                    | ✅ "Install" in ⋮ menu           | Detect Firefox, show tooltip: "Tap ⋮ → Install"               |
| Safari iOS                                           | ❌                    | ✅ Share → "Add to Home Screen"  | Detect iOS Safari, show tooltip: "Tap ↑ → Add to Home Screen" |
| Safari macOS                                         | ❌                    | ✅ File → "Add to Dock" (17+)    | Low priority; same tooltip pattern if needed                  |
| Firefox Desktop                                      | ❌                    | 🧪 Experimental "Taskbar Tabs"   | Not targeted for now                                          |

**Implementation:**

1. **Timing trigger:** Show the install prompt after the user saves their first favorite pair (proves engagement). Never on first visit.
2. **Chromium path:** Intercept `beforeinstallprompt`, call `event.preventDefault()`, stash the event. When triggered, show a custom styled banner ("Install for quick access") with a button that calls `deferredPrompt.prompt()`. Hide banner permanently after install or dismissal.
3. **Firefox Android path:** Detect via user agent. Show a dismissible tooltip: "Tap **⋮** → **Install** to add to your home screen." Dismiss permanently on tap.
4. **iOS Safari path:** Detect via user agent. Show a dismissible tooltip: "Tap **↑** (Share) → **Add to Home Screen**." Dismiss permanently on tap.
5. **Installed detection:** Use `window.matchMedia('(display-mode: standalone)')` to detect if already installed. Never show the prompt if already running as a PWA.
6. **Persistence:** Store dismissal state in localStorage (`install-prompt-dismissed`). Once dismissed or installed, never show again.

## Technical Requirements

- **Efficiency:** O(1) station-pair lookup via precomputed index; O(n) trip filtering using integer math (minutes from midnight).
- **Reliability:** Check `/api/meta` for `v` before downloading the full bundle. Graceful degradation when offline (schedule works, real-time unavailable).
- **Error Handling:** Surface clear UI states for: worker down, stale RT data (> 2min old), expired schedule, IndexedDB quota exceeded.
- **Debuggability:** Structured `console.log` with log levels (debug/info/warn/error). No external analytics. Cloudflare Worker built-in analytics for API health (no PII).
- **Accessibility:** WCAG AA minimum, AAA where achievable. Semantic HTML5, ARIA landmarks, focus management, 4.5:1 contrast ratio (7:1 target for AAA), 44px minimum touch targets.
