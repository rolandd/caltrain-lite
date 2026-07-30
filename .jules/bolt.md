## 2024-10-04 - Optimize GTFS-RT Parsing
**Learning:** The use of `reduce()` to parse array objects (`informed_entity`) within a hot loop (like GTFS-RT feed parsing) causes unnecessary function closure and garbage collection overhead, especially when allocating default initial values (e.g. `[]`) that may not be used.
**Action:** Replace `reduce()` with single-pass manual loops and lazy array initialization for performance-critical parsing functions.
