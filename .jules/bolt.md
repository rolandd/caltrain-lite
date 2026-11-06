## 2026-05-18 - Avoid closure overhead in tight parsing loops

**Learning:** High-level array methods like `.find()` and `.reduce()` create closures and intermediate array allocations that cause measurable overhead in performance-critical parsing loops (like GTFS-RT).
**Action:** Use manual `for` loops and lazy initialization (e.g., `s = s || []; s.push(val)`) in hot paths to minimize garbage collection and execution latency.
