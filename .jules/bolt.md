## 2026-05-15 - Schedule Static Caching

**Learning:** `queryTrips` was iterating over thousands of trips and invoking `indexOf` for every matched stop repeatedly per query, creating CPU overhead that was easy to optimize out. Since the `StaticSchedule` is largely read-only once loaded, we can memoize derivations.
**Action:** Used a module-level `WeakMap` to associate schedule instances with precomputed `Map`s for trip indexing and stop index lookups, turning O(N) linear scans into O(1) lookups for any subsequent queries on the same schedule, effectively halving the query execution time for typical inputs.
