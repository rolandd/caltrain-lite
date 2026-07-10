## 2025-01-24 - Cache Intl.DateTimeFormat instances

**Learning:** Initializing Intl.DateTimeFormat is an expensive operation that can cause severe performance bottlenecks when repeatedly instantiated inside frequently called functions or Svelte reactive `$derived` blocks.
**Action:** Cache and reuse these formatter objects globally or at the module/component level to dramatically improve execution speed.
