# Review guidance — intended behavior and invariants

This file documents the repository's deliberate design decisions and
invariants for anyone reviewing changes here (human or automated). It states
facts about intended behavior; it does not define what counts as a bug —
reviewers must verify claims against the code itself. Changes to this file
are ordinary changes and are reviewed like any other.

## Time, dates, and DST (scripts/process-performance.ts)

- All schedule wall times resolve through the per-day zone profile
  (`getDayZoneInfo`). Conversions must resolve the UTC offset at the target
  instant, never with a fixed or "current" offset hoisted across dates.
- `DayZoneInfo.offsetSec` is the zone offset **at local midnight** of the
  date (Pacific: -8h PST or -7h PDT), not a pre-transition offset.
- Wall/UTC arithmetic runs on the **naive local time line**, anchored so
  local midnight sits at `midnightUtcSec + offsetSec`.
- `transitionWallSec = transitionUtcSec + midnightOffsetSec`: the transition
  instant as displayed in the pre-transition offset. Wall targets at or after
  it use `transitionOffsetSec`.
- Ambiguous fall-back wall times (before `transitionWallSec`) take the
  midnight offset, i.e. the **first** occurrence — the documented edge case in
  `getLocalWallTimeUtcSec`. Skipped spring-forward wall times resolve to the
  preceding real instant.
- The transit service day starts at 03:00 local: for local times in
  00:00–02:59, the service date is the **previous** calendar day. A date
  mapping (e.g. `getTransitDateStr`) must therefore apply the 3:00 AM cutoff:
  a mapping that returns the plain calendar date for those hours is wrong,
  and late-night queries will serve the wrong day's schedule.

## Station identifiers

- Station keys are GTFS parent-station `stop_id`s **verbatim**. In the
  511.org Caltrain feed they are lowercase underscore tokens
  (`22nd_street`, `sj_diridon`) with no punctuation.
- Favorites are stored as `origin` + `"-"` + `destination` using those keys.
  This join/parse convention is pre-existing; code that re-uses it is
  following the established format, not introducing a defect.
- GTFS feeds, realtime feeds, cookies, and user-supplied keys are
  adversary-controlled (the Worker ingests third-party data). Feed values are
  not guaranteed to be well-formed; code indexing or keying by them must not
  trust their shape.

## Schedule versioning and pruning

- Schedules are content-addressed by version hash; producers and consumers
  must invalidate consistently when the version changes.
- Pruning zero-trip stations from the schedule is intentional (2026-10).
  The PWA handles stations that disappear between schedule versions
  non-destructively: favorites referencing a missing station are never
  deleted from storage (`partitionFavorites` keeps them; the UI dims and
  disables them), because the station may reappear after a feed glitch or
  short-term suspension. Only stale form selections are cleared.

## Cloudflare Worker

- No Node APIs in `worker/` (Workers runtime). Platform APIs only.
- `wrangler.toml` is generated from `wrangler.toml.tftpl`; edit the template,
  not the output. Migrations run in order in `worker/migrations`.

## Workspace quirks

- `cookie` is pinned to ^2.0.1 via a pnpm override (SvelteKit ESM interplay).
  This is a documented workaround, not a bug.
- The CI gate runs `tsc` (strict), `svelte-check`, `eslint`, and tests;
  anything those catch is already reported mechanically and needs no
  re-reporting.
