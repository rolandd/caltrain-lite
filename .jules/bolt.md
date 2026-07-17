## 2024-05-24 - Cache Trip Lookups and Stop Indices

**Learning:** Caching both the trip lookup map and station stop index maps in apps/pwa/src/lib/schedule.ts reduces query execution time by over 50% for transit route searches. The repeated rebuilding of Map objects and O(N) Array.indexOf lookups inside queryTrips loop caused an unnecessary bottleneck.
**Action:** Always use WeakMap to cache O(1) lookup structures keyed to large immutable schedule objects, preventing re-computation without leaking memory. When building index maps, use `if (!map.has(id)) map.set(id, index)` to ensure the first occurrence of a station ID is properly handled.
