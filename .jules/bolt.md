## 2024-05-15 - Fast Array Allocation in GTFS-RT Parser
**Learning:** `Array.prototype.reduce` and eager array initialization inside loops creates unnecessary closure overhead and memory allocation, noticeably slowing down performance-critical parser paths in V8 isolates like Cloudflare Workers.
**Action:** Always replace `reduce` methods with manual `for` loops and lazy array initialization (`arr = arr || []; arr.push(val)`) in hot paths where fast execution and minimal garbage collection are required.
