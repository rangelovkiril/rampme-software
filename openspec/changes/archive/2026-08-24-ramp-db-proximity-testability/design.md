## Context

See proposal.md - Why. Current shape of both modules:

- `db/ramp.ts`: `const db = new Database(dbPath, ...)` and all `stmts.prepare(...)` run at module top-level, against `config.rampDbPath`. Every exported function (`createReservation`, `cancelReservation`, ...) closes over this one connection. `cleanupOldReservations()` also runs once at module load (line 151).
- `proximity.ts`: `vehicleLastSeen` (Map) and `interval` are module-level. `tick()` calls `getGtfs()`, `getAllActiveReservations()`, `fetchVehiclePositions()`, and `getRampBridge()` directly via import, not as parameters.
- `index.ts` wiring order matters: `startProximityChecker()` runs unconditionally at import time (line 24), *before* `initRampBridge()` — which only happens inside the async `initMqtt(...).then(...)` and only if `config.mqtt.url` is set (line 51-67). `tick()` only reaches `getRampBridge()` inside its per-reservation loop, and only when `getAllActiveReservations()` is non-empty, so this ordering hasn't caused a startup crash in practice, but it means `proximity.ts` cannot assume the bridge exists at construction time — only by the time a tick actually needs it.

## Goals / Non-Goals

**Goals:**
- Both modules constructible as isolated instances with injected dependencies, so `backend/test/db/ramp.test.ts` and `backend/test/services/ramp/proximity.test.ts` can run against fakes/`:memory:` with no shared state between tests.
- Preserve `index.ts`'s existing timing (proximity checker starts before the bridge may exist; reservations db initializes synchronously, unlike the async MQTT connection).

**Non-Goals:**
- (This change's own tasks.md 3.1/3.2 in fact write the `ramp.test.ts`/`proximity.test.ts` content against #36/#65's acceptance criteria as part of this same change, not as separate follow-up.)
- Not changing `RADIUS_M`/`EXPIRY_SECONDS`/`VEHICLE_GONE_SECONDS`/`CHECK_INTERVAL_MS`/`MAX_ACTIVE` values or any SQL — behavior-identical in production.
- Not touching `bridge.ts` again (already done in `9c635a2`) beyond whatever import path changes `db/ramp.ts`'s restructuring forces.

## Decisions

**`createRampDb(dbPath)` factory, mirroring `createRampBridge()`.** Returns a `RampDb` object exposing the same function set `db/ramp.ts` exports today, now as methods bound to that instance's `Database` connection. `initRampDb(dbPath)`/`getRampDb()` wire one production singleton (called early in `index.ts`, before anything that reads reservations). Tests call `createRampDb(':memory:')` — `bun:sqlite` supports `:memory:` directly, no temp-file cleanup needed. `cleanupOldReservations()` still runs once inside the factory at construction, same as today's module-load call — harmless against a fresh `:memory:` instance.

**`createProximityChecker(deps)` takes *getter functions* for `bridge` and `gtfs`, not bound instances.** Alternative considered: accept a resolved `RampBridge` instance directly, like `createRampDb` accepts a resolved `Database`. Rejected — `db/ramp.ts`'s connection is available synchronously at construction, but the ramp bridge is not (see Context: MQTT connects asynchronously, or never, and proximity currently starts first). Passing `getRampBridge` itself (or a fake `() => RampBridge` in tests) as the dependency preserves today's lazy-resolution behavior — the checker can be constructed before the bridge exists, and only resolves it when `tick()` actually reaches a reservation needing it. `gtfs` is a getter for the same reason it already is one (`getGtfs()` returns fresh data after each `GTFS_REFRESH_INTERVAL` tick) — a snapshot would go stale.

**`rampDb` and `fetchPositions` are passed as resolved values, not getters.** `RampDb` exists synchronously once constructed (no analog to the MQTT connection delay). `fetchPositions` is injected as a plain `() => Promise<GtfsRtFeedMessage>` function so a test can stub canned vehicle positions instead of hitting `gtfs/realtime.ts`'s real fetch/decode/cache path — same shape as `bridge.test.ts`'s fake `RampMqtt`.

**`tick()` is exposed on the returned `ProximityChecker`, alongside `start()`/`stop()`.** `start()` wraps `tick()` in the existing `setInterval(CHECK_INTERVAL_MS)` loop for production; a test calls `checker.tick()` directly and awaits it, no timers or interval cleanup needed.

**Thresholds (`RADIUS_M`, `EXPIRY_SECONDS`, `VEHICLE_GONE_SECONDS`, `CHECK_INTERVAL_MS`) become factory parameters with today's values as defaults**, mirroring how `createRampBridge(mqtt, timeoutMs = DEPLOY_TIMEOUT_MS)` already defaults its timeout — production wiring passes nothing and gets identical behavior; a test can pass a smaller `EXPIRY_SECONDS` to assert expiry without waiting real time.

## Risks / Trade-offs

- [Moving `db/ramp.ts`'s functions into factory methods changes every import site's syntax (`import { createReservation } from '../db/ramp'` → `getRampDb().createReservation(...)`)] → Mitigation: mechanical, caught immediately by `bun run check` (tsc) at every call site; `routes/ramp.ts`, `services/ramp/status.ts`, `services/ramp/bridge.ts`, `services/ramp/proximity.ts` are the only importers (confirmed by grep) — small, enumerable blast radius.
- [`gtfs/enrich.ts` imports only the `RampReservation` *type* from `db/ramp.ts`] → No change needed there: the interface stays a plain top-level export from the module, only the connection and functions move into the factory.
- [A test forgets to call `createRampDb(':memory:')` per-test and instead reuses one instance across tests, reintroducing the shared-state problem this change exists to fix] → Mitigation: not enforceable by the factory itself; the new test file's own setup (`beforeEach`) is responsible, same discipline `bridge.test.ts` already demonstrates with `createRampBridge()` per test.

## Migration Plan

Plain revert if needed — no data migration (same SQLite schema, same file path), no feature flag, no deployed-surface change. Apply as commits on the existing `refactor/ramp-testability` branch (continuing `9c635a2`/`a22672f`'s pattern), single PR. `bun run check` + `bun run test` in `backend/` before merge confirm nothing broke; a manual smoke check that `bun run dev` still starts cleanly with and without `MQTT_URL` set covers the timing risk noted in Context (proximity checker constructed before the bridge exists).

## Open Questions

(none — the getter-vs-instance question for `bridge`/`gtfs` is resolved above, not deferred, since it changes the factory signature.)
