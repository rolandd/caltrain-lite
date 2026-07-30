## 2024-03-06 - Optimize GTFS-RT Protobuf Array Parsing

**Learning:** In performance-critical Cloudflare Workers that parse large protobuf responses (like GTFS-RT), using higher-order array functions like `reduce`, `map`, and `filter` creates unnecessary callback overhead and intermediate array allocations. In the specific case of parsing Service Alerts `informed_entity` arrays, replacing consecutive `reduce` loops with a single `for...of` loop provided a measurable speedup (~150,000 ops/sec to ~170,000 ops/sec in microbenchmarks).
**Action:** Always prefer basic `for` or `for...of` loops over chainable array methods when parsing large repetitive data structures in the `worker` package.
