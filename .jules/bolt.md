## 2026-09-25 - Optimize array extraction in protobuf parsers

**Learning:** Using high-level array methods like .reduce() and .find() in hot loops for GTFS-RT protobuf parsed fields causes unnecessary closure allocations and garbage collection overhead.
**Action:** For performance-critical data parsing (like worker GTFS-RT), use single-pass manual for-loops and lazily initialize arrays to minimize overhead.
