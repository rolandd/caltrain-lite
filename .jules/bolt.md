## 2024-05-29 - Cache Intl.DateTimeFormat
**Learning:** Initializing `Intl.DateTimeFormat` inside a frequently called function (`getTransitDayStartEpoch`) caused severe performance bottlenecks.
**Action:** Extract formatters to module-scoped variables to reuse instances.
