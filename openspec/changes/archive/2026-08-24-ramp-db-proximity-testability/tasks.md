## 1. `db/ramp.ts` factory

- [x] 1.1 Wrap the `Database` connection, prepared statements, and `cleanupOldReservations()` startup call in `createRampDb(dbPath)`, returning a `RampDb` object with the existing function set as methods; keep `RampReservation` as a plain top-level exported interface. Verify `bun run check` passes with no remaining module-level `db`/`stmts`.
- [x] 1.2 Add `initRampDb(dbPath)` / `getRampDb()` singleton wiring, mirroring `getMqtt()`/`getGtfs()`/`getRampBridge()`. Verify `getRampDb()` throws a clear error if called before `initRampDb()`, matching `getRampBridge()`'s existing behavior.
- [x] 1.3 Update `backend/src/index.ts` to call `initRampDb(config.rampDbPath)` during startup (before anything that reads reservations), and update `routes/ramp.ts`, `services/ramp/status.ts`, `services/ramp/bridge.ts` to call `getRampDb()` instead of importing bare functions. Verify `bun run dev` starts cleanly and `GET /health` responds.

## 2. `services/ramp/proximity.ts` factory

- [x] 2.1 Implement `createProximityChecker(getBridge, getGtfs, rampDb, fetchPositions, config?)` per design.md's Decisions (getter functions for `bridge`/`gtfs`, resolved values for `rampDb`/`fetchPositions`, threshold config with today's constants as defaults), returning a `ProximityChecker` with `tick()`, `start()`, `stop()`. Verify `bun run check` passes with no remaining module-level `vehicleLastSeen`/`interval`.
- [x] 2.2 Update `backend/src/index.ts` to construct one `ProximityChecker` via the factory (passing `getRampBridge`, `getGtfs`, `getRampDb()`, `fetchVehiclePositions`) and call `.start()`, preserving the current unconditional-startup timing (before `initRampBridge()` may have run). Verify `bun run dev` starts cleanly with `MQTT_URL` unset and with it set.

## 3. Tests

- [x] 3.1 Add `backend/test/db/ramp.test.ts` (mirror-tree per `unify-test-structure`) covering #36's original acceptance criteria against `createRampDb(':memory:')`: `pending → active → done` and `cancelled`/`expired` paths, the `MAX_ACTIVE` cap enforced per session, the session-ownership check in `cancelReservation` (a session cannot cancel another session's reservation), and the duplicate-reservation rejection. Verify `bun run test` passes.
- [x] 3.2 Add `backend/test/services/ramp/proximity.test.ts` covering #65's proximity-coverage ask against a fake bridge/`fetchPositions` and `createRampDb(':memory:')`: a reservation inside `RADIUS_M` of its stop triggers `publishDeploy` exactly once (not re-triggered while already in flight), a reservation whose vehicle has been absent past `VEHICLE_GONE_SECONDS` expires, a reservation older than `EXPIRY_SECONDS` expires regardless of vehicle position, and the deploy-trigger flag clears once the vehicle moves `> RADIUS_M * 2` away. Verify `bun run test` passes.
- [x] 3.3 Run `bun run check` and `bun run test` in `backend/` for the full suite and confirm both are clean.
