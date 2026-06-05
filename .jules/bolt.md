## 2024-06-05 - Intl.DateTimeFormat instantiation overhead

**Learning:** `Intl.DateTimeFormat` is an expensive operation that can cause performance bottlenecks if instantiated repeatedly inside frequently called functions (like Svelte reactive derived values).
**Action:** Cache and reuse `Intl.DateTimeFormat` objects globally or at the module level to improve execution speed.
