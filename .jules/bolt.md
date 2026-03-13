## 2025-03-12 - GTFS-RT Parser Optimization
**Learning:** Using multiple `reduce` iterations with intermediate array allocations inside a hot path (like parsing every informed entity in `service_alerts`) can add overhead compared to a single-pass `for` loop, especially when creating small, short-lived strings.
**Action:** Prefer single-pass iterative `for` loops in highly executed parsing logic rather than relying on functional style array iterations.
