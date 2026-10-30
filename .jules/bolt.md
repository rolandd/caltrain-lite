## 2024-10-30 - Lazy Array Initialization in GTFS-RT Parsing

**Learning:** Using high-level array methods like `.reduce()` and eagerly allocating empty arrays (`[]`) in hot paths like GTFS-RT feed parsing adds significant garbage collection overhead and increases the worker's JSON payload size.
**Action:** Replace array methods with manual single-pass `for` loops and lazily initialize array fields (`s = s || []; s.push(val)`) in performance-critical parsing functions to minimize memory allocation overhead.
