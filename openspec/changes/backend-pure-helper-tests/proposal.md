## Why

`gtfs/time.ts` and parts of `services/transit/arrivals.ts` have no testability barrier at all — unlike `db/ramp.ts`/`proximity.ts` (`ramp-db-proximity-testability`), they need no factory or dependency injection. `gtfs/time.ts`'s functions are already pure and already exported; `arrivals.ts`'s `collectScheduledArrivals` and `deduplicateAndSort` are pure but not exported (a one-line fix each). This is the original, still-unaddressed acceptance criteria from #35 ("Tests for GTFS time handling", "Tests for arrivals merge"), re-flagged again by #65. Distinct from `ramp-db-proximity-testability`: no design decisions here, just exporting two helpers and writing the tests.

## What Changes

- Export `collectScheduledArrivals` and `deduplicateAndSort` from `services/transit/arrivals.ts` (currently module-private, no behavior change).
- Add `backend/test/gtfs/time.test.ts` covering `parseGtfsTime`, `normalizeGtfsHour`, and `computeScheduledEtaMinutes` — including the midnight-wrap branches (`WRAP_THRESHOLD_MINUTES`, `PAST_GRACE_MINUTES`) and 24+ hour GTFS times.
- Add `backend/test/services/transit/arrivals.test.ts` covering `collectScheduledArrivals` (same-day service, yesterday's after-midnight service via `fromYesterdayService`, sibling stop_ids) and `deduplicateAndSort` (dedup by `id`, sort by `eta_minutes`, `limit` truncation).
- `getUpcomingArrivals` itself (the orchestrator) is out of scope — it hardwires `fetchTripUpdates`/`fetchVehiclePositions` via direct import, the same implicit-dependency shape `ramp-db-proximity-testability` addresses for `proximity.ts`; giving it the same DI treatment is a separate, later decision, not bundled here.

## Capabilities

No spec-level behavior changes; test content only (`skip_specs: true`).

### New Capabilities
(none)

### Modified Capabilities
(none)

## Impact

- `backend/src/services/transit/arrivals.ts`: two `export` keywords added, no logic change.
- New: `backend/test/gtfs/time.test.ts`, `backend/test/services/transit/arrivals.test.ts` (mirror-tree per `unify-test-structure`).
- No production behavior change, no wiring changes, no wiki/infra/env-var updates.
