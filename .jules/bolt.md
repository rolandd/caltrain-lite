## 2024-09-18 - Caching lookups in schedule queries

**Learning:** Rebuilding `Map`s (like `tripById`) inside frequently called query functions and repeatedly calling `indexOf` for station patterns adds massive O(N) overhead.
**Action:** Use module-level `WeakMap`s to cache O(1) `Map` lookups keyed by pattern arrays and schedule objects. This ensures Maps are only built once per object reference and are safely garbage collected when the schedule data updates.
