## 2026-07-24 - Cache Intl.DateTimeFormat

**Learning:** Initializing Intl.DateTimeFormat is an expensive operation that can cause severe performance bottlenecks if repeatedly instantiated inside frequently called functions (like getTransitDayStartEpoch) or Svelte reactive $derived blocks.
**Action:** Cache and reuse Intl.DateTimeFormat objects globally or at the module/component level to dramatically improve execution speed and reduce unnecessary overhead in reactive blocks.
