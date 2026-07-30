## 2024-05-24 - [Avoid `reduce` in GTFS-RT Parsing]

**Learning:** For performance-critical code in the Cloudflare Worker, specifically GTFS-RT Protobuf parsing, using `reduce` to extract lists from arrays (e.g. `stop_id` and `trip_id` from service alerts) creates intermediate array allocations and callback overhead. This impacts operations per second in high-frequency parsing paths.
**Action:** Replace `reduce` with single-pass `for` loops in hot paths to minimize callback overhead and unnecessary object creation.
