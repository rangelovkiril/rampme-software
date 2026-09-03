## Why

`backend/AGENTS.md`'s testing callout names GTFS static/GTFS-RT decoding as untested, and it still is: `backend/test/gtfs/realtime.test.ts` covers only `startPushLoop`'s cadence guarantee (that it publishes unconditionally regardless of fetch success), not the actual decode path (`fetchFeed`'s `FeedMessage.decode().toJSON()`), and `backend/src/gtfs/static.ts` (ZIP fetch, CSV parsing, `normalizeRouteType`, building the `GtfsData` maps/indexes) has no test file at all. This is the parsing layer every other GTFS-dependent feature (arrivals, proximity, enrichment) sits on top of; a malformed-input regression here would surface as confusing downstream failures rather than a clear, localized test failure.

## What Changes

- Add fixture-based unit tests for `gtfs/static.ts`'s CSV parsing and `GtfsData` construction (small checked-in fixture ZIP with a handful of stops/routes/trips, including at least one row exercising `normalizeRouteType`'s extended route-type mapping and one with a GTFS 24+ hour `stop_time`).
- Add fixture-based unit tests for `gtfs/realtime.ts`'s protobuf decode path (`fetchFeed`), using a small pre-encoded fixture `FeedMessage` built with the same `proto/gtfs-realtime.proto` descriptor the app ships, so the test exercises the real decode boundary instead of a hand-built JS object.
- Where a function resists testing in isolation (e.g. `fetchStaticGtfs`/`fetchFeed` currently call `fetch()` directly), apply the DI-factory / pure-function extraction heuristic already documented in `backend/AGENTS.md`'s Rules section, consistent with how `ramp-db-proximity-testability` and `backend-pure-helper-tests` did this for other modules.
- No parsing/decoding behavior changes — this only adds coverage for existing behavior.

## Capabilities

No spec-level behavior changes — this adds test coverage for already-existing, unchanged parsing/decoding behavior. `skip_specs: true` is set in this change's `.openspec.yaml`.

## Impact

- New: `backend/test/gtfs/static.test.ts`, `backend/test/gtfs/decode.test.ts` (or similar, naming decided in tasks.md — distinct from the existing `realtime.test.ts` which stays scoped to cadence).
- New: a small fixture GTFS ZIP and a pre-encoded GTFS-RT protobuf fixture under `backend/test/fixtures/` (or wherever the mirror-tree convention places test fixtures).
- Possible small extraction in `backend/src/gtfs/static.ts` / `backend/src/gtfs/realtime.ts` if a function needs to be pulled out to be unit-testable without a live network call — no behavior change, construction only.
