## 2025-05-15 - Optimize GTFS-RT Service Alert Parsing

**Learning:** Array `.reduce()` with empty array initialization causes significant overhead and garbage collection in hot code paths like GTFS-RT parsing.
**Action:** Replace high-level array methods with single-pass manual loops and lazy array initialization (`s = s || []; s.push(val)`) in performance-critical parsing functions.
