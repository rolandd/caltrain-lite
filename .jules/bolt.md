## 2024-04-03 - Avoid `reduce()` in performance-critical parsing loops
**Learning:** In hot loops like the GTFS-RT feed parser, using `Array.prototype.reduce()` with closure callbacks and eagerly allocating empty arrays `[]` adds measurable overhead due to function calls and garbage collection.
**Action:** Replace `reduce()` and filter/map chains with manual `for` loops, and use lazy initialization for accumulator arrays (e.g., `let s; if (match) { s = s || []; s.push(match); }`) to eliminate callback overhead and avoid allocating empty arrays.
