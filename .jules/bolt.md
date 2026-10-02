## 2024-10-02 - Array method replacement in GTFS-RT parser and Schedule query
**Learning:** High-level array methods like `reduce()` and `find()` create unnecessary closure overhead and garbage collection in performance-critical code paths such as the GTFS-RT protobuf parser or frequent schedule queries. Eager empty array allocations also create overhead.
**Action:** Replace `reduce()` and `find()` with manual loops, and utilize lazy array initialization to optimize execution time and garbage collection.
