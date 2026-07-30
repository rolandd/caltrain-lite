## 2025-02-18 - Replacing map/reduce with manual loops and lazy allocations

**Learning:** In performance-critical code in the `worker` package (e.g., GTFS-RT parsing), using `reduce()` and eager array allocations inside tight loops adds closure overhead and causes excessive garbage collection.
**Action:** Replace `reduce()` with single-pass manual `for...of` loops and lazy initialization (e.g., `s = s || []; s.push(val)`) to minimize overhead and improve parsing performance on the Hot-Path.
