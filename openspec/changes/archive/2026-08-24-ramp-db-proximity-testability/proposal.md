## Why

`db/ramp.ts` and `services/ramp/proximity.ts` are the last two ramp-domain modules still shaped the way `services/ramp/bridge.ts` was before `9c635a2` (`refactor/ramp-testability`, current branch): module-level singleton state (a `Database` connection opened at import time in `db/ramp.ts`; a `vehicleLastSeen` Map and `interval` handle in `proximity.ts`) closed over directly instead of injected. This is not hypothetical — `bridge.test.ts` already imports the `RampReservation` *type* from `db/ramp.ts`, and that import alone opens/creates a real SQLite file on disk (`config.rampDbPath`) as a side effect, because there is no way to construct an isolated instance. `proximity.ts` is the module #65 names as still needing coverage, and it is the code that physically triggers ramp deployment via GPS proximity — the highest-stakes, currently-untested path in the backend.

Following the same DI-factory principle `9c635a2` established (and the mirror-tree + testability-heuristic convention captured in `unify-test-structure`), this change makes both modules instantiable, so that writing the actual reservation-lifecycle and proximity-trigger tests (#36's original acceptance criteria, re-flagged by #65) becomes a normal test-writing task instead of also requiring a refactor first.

## What Changes

- `db/ramp.ts`: move the `Database` connection, prepared statements, and all exported functions (`createReservation`, `cancelReservation`, `getSessionReservations`, `getVehicleReservations`, `getAllActiveReservations`, `setReservationStatus`, `cleanupOldReservations`) into a `createRampDb(dbPath)` factory returning a `RampDb` instance. Production wires one singleton via `initRampDb(config.rampDbPath)`/`getRampDb()`, mirroring `getMqtt()`/`getGtfs()`/`getRampBridge()`. Tests call `createRampDb(':memory:')` directly.
- `services/ramp/proximity.ts`: move `vehicleLastSeen`, the `tick()` logic, and the `setInterval` lifecycle into a `createProximityChecker(bridge, gtfs, rampDb, fetchPositions, config)` factory returning a `ProximityChecker` with `start()`/`stop()`/`tick()` (the last exposed for direct invocation in tests, bypassing the interval). Production wires one instance at startup; tests call the factory with fakes for `bridge`, a static `GtfsData`, an in-memory `rampDb`, and a stubbed `fetchPositions`.
- `routes/ramp.ts`, `index.ts`, and anywhere else importing bare functions from `db/ramp.ts` or `proximity.ts` switch to going through `getRampDb()` / the wired `ProximityChecker` instance.
- No behavior change: same SQL, same distance/expiry thresholds, same MQTT interactions — only how the state is constructed and reached.
- **BREAKING** (internal only, not a public API): direct imports of `db/ramp.ts`'s functions or `startProximityChecker()` from `proximity.ts` stop working; callers must go through the new getters. No external contract changes.

## Capabilities

No spec-level behavior changes; this is a testability refactor only (`skip_specs: true`).

### New Capabilities
(none)

### Modified Capabilities
(none)

## Impact

- `backend/src/db/ramp.ts`: restructured into `createRampDb()` factory + `initRampDb()`/`getRampDb()` singleton wiring.
- `backend/src/services/ramp/proximity.ts`: restructured into `createProximityChecker()` factory + `initProximityChecker()`/`getProximityChecker()` singleton wiring (or equivalent — exact shape decided in design.md).
- `backend/src/index.ts`: startup wiring updates (where `initRampBridge()` and `startProximityChecker()` are currently called).
- `backend/src/routes/ramp.ts`: switches from importing `db/ramp.ts` functions directly to `getRampDb()`.
- `backend/src/services/ramp/status.ts`: reads reservations via `db/ramp.ts` — same switch to `getRampDb()`.
- New test files: `backend/test/db/ramp.test.ts`, `backend/test/services/ramp/proximity.test.ts` (mirror-tree, per `unify-test-structure`), covering #36's original acceptance criteria (lifecycle transitions, `MAX_ACTIVE` cap, session-ownership authz on cancel) and #65's proximity-coverage ask (distance-triggered deploy, vehicle-gone expiry, creation-age expiry).
- No wiki/infra/env-var/MQTT-protocol changes.
