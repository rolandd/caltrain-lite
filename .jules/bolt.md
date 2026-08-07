## 2024-05-24 - Cache Intl.DateTimeFormat in Svelte Components

**Learning:** Initializing `Intl.DateTimeFormat` or calling `toLocaleDateString` inside frequently evaluated Svelte `$derived` blocks or rendering loops is an expensive operation that can cause severe performance bottlenecks. Uncached instantiations take ~395ms per 1000 calls vs ~1.7ms when cached.
**Action:** Always cache and reuse `Intl.DateTimeFormat` objects globally or at the module/component level to dramatically improve execution speed and prevent rendering lag.
