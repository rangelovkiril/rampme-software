## 1. `gtfs/time.ts`

- [x] 1.1 Add `backend/test/gtfs/time.test.ts` for `parseGtfsTime`/`normalizeGtfsHour`: normal times, `≥24:00` GTFS times (e.g. `26:52` → `02:52`). Verify `bun run test` passes.
- [x] 1.2 Add cases to the same file for `computeScheduledEtaMinutes`: same-day future stop, slightly-past stop within `PAST_GRACE_MINUTES` (returns `null`), near-midnight wrap past `WRAP_THRESHOLD_MINUTES` (e.g. now 23:58, scheduled 00:07), a stale previous-day stop seen after midnight (large positive diff, returns `null`). Verify `bun run test` passes.

## 2. `services/transit/arrivals.ts`

- [x] 2.1 Export `collectScheduledArrivals` and `deduplicateAndSort` from `arrivals.ts` (no logic change). Verify `bun run check` passes.
- [x] 2.2 Add `backend/test/services/transit/arrivals.test.ts` for `collectScheduledArrivals`: a same-day scheduled arrival within the active service, an after-midnight arrival from yesterday's service via `fromYesterdayService` (`arrival_time` ≥ `currentMinutes + 1440`), a sibling stop_id (`stopsByCode`) included, and a trip whose `service_id` is inactive on both today and yesterday excluded. Verify `bun run test` passes.
- [x] 2.3 Add cases to the same file for `deduplicateAndSort`: duplicate `id`s collapse to the first occurrence, results sort by `eta_minutes` ascending, and `limit` truncates. Verify `bun run test` passes.

## 3. Verify

- [x] 3.1 Run `bun run check` and `bun run test` in `backend/` for the full suite and confirm both are clean.
