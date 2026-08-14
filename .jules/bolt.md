## 2025-05-18 - Avoid array methods in hot paths

**Learning:** In performance-critical worker code (like GTFS-RT parsing), using `reduce()` or eager array allocations on heavily nested/repeated structures adds significant closure overhead and garbage collection pauses.
**Action:** Replace functional array methods like `reduce()` with single-pass manual loops and lazy array initialization (e.g. `s = s || []; s.push(val)`) for small objects parsed from protobuf to minimize overhead.
