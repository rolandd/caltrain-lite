## 2026-09-11 - Optimize `queryTrips` and `findStopIndex` with Caching

**Learning:** Rebuilding trip lookup map (`Map<string, Trip>`) and performing repeated `indexOf` scans over stop patterns inside frequently-called functions like `queryTrips` and `findStopIndex` causes significant performance bottlenecks. Using a `WeakMap` mapped to the `StaticSchedule` to cache pre-computed index maps for stop patterns and trips provides an O(1) performance increase.
**Action:** Next time you query schedule-like data repeatedly, use a `WeakMap` on the reference schedule objects to cache derived lookups (like arrays to index-Maps) to avoid repetitive loop allocations.
