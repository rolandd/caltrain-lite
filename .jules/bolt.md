## 2025-01-29 - Intl.DateTimeFormat instantiation bottleneck

**Learning:** Initializing Intl.DateTimeFormat is an expensive operation that can cause severe performance bottlenecks if repeatedly instantiated inside frequently called functions or Svelte reactive `$derived` blocks.
**Action:** Cache and reuse these objects globally or at the module/component level to dramatically improve execution speed.
