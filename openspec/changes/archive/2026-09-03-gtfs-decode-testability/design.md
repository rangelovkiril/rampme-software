## Context

See proposal.md - Why. `gtfs/static.ts`'s `fetchStaticGtfs()` and `gtfs/realtime.ts`'s `fetchFeed()` both call `fetch()` directly and are the only entry points into their respective parsing logic (`parseCsv`, `normalizeRouteType`, the `GtfsData` map/index construction; `FeedMessage.decode().toJSON()`). Neither is currently structured for testing without a live network call.

## Goals / Non-Goals

**Goals:**
- Exercise the real parsing/decoding code paths (CSV parsing, route-type normalization, GTFS 24+ hour handling, protobuf decode via the shipped `.proto`/`.json` descriptor) against fixture bytes, not hand-built JS objects that skip the boundary being tested.
- Follow the existing DI-factory / pure-function extraction heuristic (`backend/AGENTS.md`) already used for `ramp-db-proximity-testability` and `backend-pure-helper-tests`.

**Non-Goals:**
- Not testing against the real `gtfs.sofiatraffic.bg` upstream, in this change or in CI generally - that remains a live-network integration concern, out of scope.
- Not changing `fetchStaticGtfs()`/`fetchFeed()`'s public behavior or return shape.

## Decisions

- **Extract the parse/decode step from the fetch step.** `fetchStaticGtfs()` becomes a thin `fetch()` wrapper around a new pure function (e.g. `parseGtfsZip(buf: ArrayBuffer): GtfsData`) that the test calls directly with fixture bytes; same pattern for `fetchFeed()`'s decode half. This mirrors the `createRampDb()`/`createProximityChecker()` factory precedent's underlying principle - pull the untestable I/O boundary to the edge, keep the logic pure and directly callable.
- **Fixtures are small, hand-built, and checked in**, not a trimmed copy of the real Sofia GTFS feed. A minimal ZIP with a handful of stops/routes/trips (including one row exercising `normalizeRouteType`'s extended-type mapping and one GTFS 24+ hour `stop_time`) is easier to reason about and keep in sync with test assertions than a large real-world extract would be. Same for the GTFS-RT fixture: a small `FeedMessage` encoded with the app's own `proto/gtfs-realtime.proto` descriptor via `protobufjs`, generated once by a throwaway script and committed as bytes (not regenerated at test time).
- **Fixture location**: `backend/test/fixtures/`, matching the mirror-tree test layout's existing convention of keeping test-only assets near `test/`.

## Risks / Trade-offs

- [Hand-built fixtures can drift from the real feed's actual shape over time] → the fixture only needs to match the documented GTFS/GTFS-RT spec shape, not any particular real feed snapshot; the code under test already treats the real feed as just another instance of that documented shape.
- [Extracting a pure `parseGtfsZip`/decode function is a small production-code change, not purely additive] → no behavior change, covered by existing `tsc`/`biome check`, and this is the same accepted trade-off already made for `db/ramp.ts` and `services/ramp/proximity.ts` in prior testability work.

## Migration Plan

Plain revert - test-only change plus a non-behavioral extraction in two source files. No environment variables, no deployment impact.
