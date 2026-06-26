## 2024-07-26 - [Cache Intl.DateTimeFormat instances]

**Learning:** Instantiating `Intl.DateTimeFormat` is extremely expensive (~4.5ms vs ~0.02ms for cached). Creating new instances inside Svelte `$derived.by` blocks or utility functions like `getTransitDayStartEpoch` causes severe performance bottlenecks during render cycles and reactivity updates.
**Action:** Always cache and reuse `Intl.DateTimeFormat` objects globally or at the module/component level to dramatically improve execution speed and reduce main thread blocking.
