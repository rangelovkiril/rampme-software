## Why

A full read of the TypeScript in `backend/src`, `frontend`, and `hw-sim` found that the quality gates the project relies on do not actually cover the code they are assumed to cover, and that a set of idiom, dead-code, and duplication problems have accumulated behind that blind spot. All three apps pass `bun run check` today, so none of this is visible.

Two findings are defects rather than style:

- `frontend/biome.json`'s `files.includes` list omits `**/*.tsx`, so Biome processes 18 of 41 files and every React component is excluded from both lint and format. Adding the pattern surfaces 61 errors and 17 warnings that have never been reported, including 13 `useExhaustiveDependencies` (a correctness rule for React effect dependencies), 8 `a11y/noSvgWithoutTitle`, `a11y/noStaticElementInteractions`, and `a11y/useKeyWithClickEvents`. Undetected accessibility lint violations are a poor fit for an application whose purpose is accessibility. Separately, 21 of 26 `.tsx` files are unformatted.
- `services/ramp/proximity.ts`'s `tick()` calls `getBridge()` with no availability guard, while `routes/ramp.ts` guards the equivalent call with `isRampBridgeAvailable()`. With `MQTT_URL` unset, `getRampBridge()` throws, `tick()` rejects, and every reservation after the throwing one is skipped for that tick, so expiry never runs. `backend/AGENTS.md` documents running without a broker as supported, and `openspec/changes/archive/2026-09-03-ramp-reserve-without-mqtt` already established that the reservation lifecycle must not depend on bridge availability. This is the same defect class in the one code path that change did not cover.

The remaining findings are internal quality. Doing them together is deliberate: the Biome fix mechanically rewrites most `.tsx` files, so any later cleanup in those files would conflict with it, and the constant, naming, and duplication work touches the same modules as the Elysia idiom work.

## What Changes

**Tooling and formatting**

- `frontend/biome.json` includes `**/*.tsx`; the 78 resulting lint findings are resolved and all `.tsx` files are formatted.

**Defect fixes**

- Reservation expiry in `services/ramp/proximity.ts` runs regardless of hardware-bridge availability, and a missing bridge no longer aborts a tick.

**Elysia idiom**

- Every request and response shape is defined once as a TypeBox model registered with `.model()`, and its TypeScript type is derived with `Static<>`. The hand-written interfaces are deleted. Today `EnrichedVehicle` (`gtfs/enrich.ts`) and `EnrichedVehicleSchema` (`routes/realtime.ts`) are the same shape written twice by hand with nothing linking them, and `frontend/lib/types.ts` writes it a third time; declaring schemas alongside the interfaces would multiply that rather than fix it.
- The frontend derives its types from the backend through Elysia Eden, and `frontend/lib/types.ts` is deleted. This removes the last hand-maintained copy of the wire format.
- Route handlers return errors through Elysia's `status()` helper instead of `services/state.ts`'s `jsonError()`, which returns a raw `Response` and therefore bypasses response schema validation and OpenAPI generation. `routes/realtime.ts` already documents this constraint in a comment on `/realtime/vehicles`, the one route that declares a `response` schema.
- All routes declare `response` schemas by referencing the registered models. Twelve of thirteen currently do not, so responses are neither validated nor described in `/docs`.
- `params` and `headers` are validated with TypeBox instead of hand-rolled checks (`Number.isFinite` on `params.id`, a regex session-id check repeated at three call sites in `routes/ramp.ts`).
- Duplicated inline schemas and parsing are replaced with shared models and a reusable guard: the `GTFS_NOT_READY` helper defined identically in three route files, the vehicle-filter query object repeated in `routes/realtime.ts`, and the `limit` clamp repeated verbatim in `routes/stops.ts`.

**Dead code removal**

- `config.protoPath` and its `PROTO_PATH` environment variable, which have no reader.
- `GtfsData.stopTimes` and `GtfsData.shapes`, neither of which is read outside `gtfs/static.ts`, where both are local build inputs for the indexes that are actually consumed.
- `MQTTHub.disconnect()`, never called.
- `StopTime.departure_time`, `Trip.direction_id`, and `Stop.wheelchair_boarding`, parsed from CSV and never read.
- `RampDb.cleanupOldReservations` is either removed from the public interface or given a real caller; today it is on the interface but invoked only once, at construction, so the table grows until restart.
- The defensive `try`/`catch` blocks around purely synchronous `Map` lookups in `routes/transit.ts`.

**Duplication**

- `components/ui/FloatingNav.tsx`'s primary and secondary vehicle handling, roughly 90 lines duplicated verbatim across two effects that differ only by identifier prefix, collapses into one reusable trip-info hook. The same ETA-merge loop appears four times in that file and once in `components/sheets/VehicleTripSheet.tsx`.
- Frontend request URLs move behind the Eden client. Thirteen endpoint literals are currently spread across components, and `/stops` is fetched independently by `components/layers/StopsLayer.tsx` and `components/panels/StopsPanel.tsx`.

**Constants**

- `DEPLOY_TIMEOUT_MS`, read directly from `process.env` in `services/ramp/bridge.ts`, and `TZ`, read directly in `gtfs/time.ts`, move into `config/index.ts`, which `backend/AGENTS.md`'s Rules section already requires. `TZ` is additionally absent from that file's environment variable table.
- `config/index.ts` validates its values. `Number(process.env.PORT ?? 3000)` yields `NaN` silently for a malformed value. `hw-sim/src/config.ts` already implements the intended pattern with `positiveInt()` and `port()`.
- Per-module magic numbers are consolidated where they are shared rather than left inline: the arrival `limit` bounds and the 50-route-id cap in `routes/`, alongside the existing named constants in `services/ramp/proximity.ts`, `services/sse.ts`, `gtfs/realtime.ts`, and `gtfs/time.ts`.

**Naming**

- **BREAKING**: every API request and response field becomes camelCase. `EnrichedVehicle` currently mixes conventions within a single interface (`tripId` and `lat` beside `route_id` and `ramp_status`), and the mix is copied verbatim into `frontend/lib/types.ts` and from there into every consuming component. Measured scope: 44 snake_case fields across 8 response types, 334 references across 17 frontend files. `POST /ramp/reserve`'s body becomes `{ vehicleId, stopId, type }`.
- Internal types that mirror an external schema keep that schema's spelling: `Stop`, `Route`, `Trip`, `StopTime`, and `CalendarDate` stay snake_case as GTFS columns, and `RampReservation` stays snake_case as SQLite columns. The translation happens once, at the response boundary. Four routes that currently return rows straight through (`/stops`, `/stops/:id`, `/routes`, and the three ramp routes serving `RampReservation`) gain an explicit mapping function, which they have never had.
- Abbreviated component filenames (`ResBanner.tsx`, `ResDetailCard.tsx`, `NavBtn.tsx`) are spelled out to match their siblings (`ReservationsPanel.tsx`, `StopArrivalsSheet.tsx`, `MapControls.tsx`).

**Stale comments**

- Four comments reference `openspec/changes/ramp-vehicle-accessibility`, archived on 2026-09-07 and synced to `openspec/specs/ramp/vehicle-accessibility` (`gtfs/types.ts:126`, `services/ramp/status.ts:8`, `components/layers/VehiclesLayer.tsx:15`, `e2e/transit.spec.ts:51`). `gtfs/types.ts:127` references `scripts/refresh-accessibility.ts`, which no longer exists in this repository. `backend/AGENTS.md` already points at the correct paths, so only the code comments drifted.

Overall comment density in `backend/src` is 10 percent of non-blank lines, which is not excessive, so this change corrects stale and duplicated comments rather than reducing comments generally. The two locally overgrown spots are the 26-line protocol header in `services/ramp/bridge.ts`, which restates the wiki's ramp MQTT protocol page, and `gtfs/static.ts`'s `parseCsv` JSDoc, which restates its own signature.

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
- `ramp/reservations`: adds a requirement that reservation expiry, like creation and cancellation, is independent of hardware-bridge availability.

> **Prerequisite.** `ramp/reservations` was introduced by `openspec/changes/archive/2026-09-03-ramp-reserve-without-mqtt` but never synced into `openspec/specs/`, so the capability exists only in the archive. It is the only such gap; the other six archived capabilities are synced. Because the root `AGENTS.md` requires that fixing drift in an already-archived change happen on its own branch, that sync is not bundled into this change and must land before this change's delta can apply cleanly.

Everything outside the proximity fix is a pure refactor with no spec-level behavior change, so no other capability is touched.

## Impact

**Excluded by design.** `EnrichedVehicle.ramp_reservations` is dead payload but is already covered by the open `openspec/changes/simplify-vehicle-ramp-payload`; it stays there rather than being duplicated here. Replacing the `getX()`/`initX()` module singletons with Elysia `.state`/`.derive` is also excluded: it is idiomatic, but it reverses the DI-factory shape `backend/AGENTS.md` chose for testability and deserves its own change.

- `frontend/biome.json` (`files.includes`), and consequently all 26 `.tsx` files under `frontend/app`, `frontend/components`, and `frontend/contexts`
- `backend/src/services/ramp/proximity.ts` (`tick()`'s `getBridge()` call)
- `backend/src/routes/stops.ts`, `routes/transit.ts`, `routes/realtime.ts`, `routes/ramp.ts` (error returns, `response`/`params`/`headers` schemas, shared models)
- `backend/src/services/state.ts` (`jsonError()`)
- `backend/src/config/index.ts` (validation; adds `deployTimeoutMs` and `tz`, removes `protoPath`)
- `backend/src/services/ramp/bridge.ts` (`DEPLOY_TIMEOUT_MS`), `backend/src/gtfs/time.ts` (`TZ`)
- `backend/src/gtfs/types.ts` (`GtfsData.stopTimes`, `GtfsData.shapes`, `StopTime.departure_time`, `Trip.direction_id`, `Stop.wheelchair_boarding`, stale comments), `backend/src/gtfs/static.ts` (parsing of the removed fields)
- `backend/src/gtfs/enrich.ts`, `services/transit/arrivals.ts`, `services/transit/trip-details.ts` (interfaces replaced by derived model types), plus a new backend schema-model module and response-mapping functions for `routes/stops.ts`, `routes/transit.ts`, and `routes/ramp.ts`
- `backend/src/index.ts` (exports `type App`), `frontend/tsconfig.json` (`paths` for Eden's single Elysia instance), `frontend/package.json` (`@elysiajs/eden`), and `frontend/lib/types.ts` (deleted)
- `.github/workflows/frontend.yaml` (the frontend type-check now needs the backend's dependencies installed)
- Root `AGENTS.md`'s typing rule, which currently has no clause for outgoing response shapes and is the reason the duplication accumulated
- `backend/src/services/mqtt.ts` (`MQTTHub.disconnect()`), `backend/src/db/ramp.ts` (`cleanupOldReservations`)
- `backend/src/services/ramp/status.ts`, `frontend/e2e/transit.spec.ts`, `frontend/components/layers/VehiclesLayer.tsx` (stale comments)
- `frontend/components/ui/FloatingNav.tsx`, `frontend/components/sheets/VehicleTripSheet.tsx`, plus a new frontend hook and API module
- `frontend/components/ui/ResBanner.tsx`, `ResDetailCard.tsx`, `NavBtn.tsx` (renames) and their importers
- `backend/test/`, `frontend/test/`, `frontend/e2e/` where fixtures reference removed fields or renamed files

**Public API.** This is a breaking change to every endpoint's field spelling on `api.rampme.site`, on both the request and response side. The frontend is the only known consumer and is updated in the same change; because it derives its types from the backend through Eden, every stale reference is caught by `tsc` rather than by inspection. The two apps must deploy together.

**Environment variables.** `PROTO_PATH` is removed and `TZ` is documented for the first time; `DEPLOY_TIMEOUT_MS` keeps its name and default but moves to `config/index.ts`. `backend/AGENTS.md`'s environment variable table and its Rules section are updated in the same change. No MQTT topic shape, CORS origin, deployment path, or wiki-documented protocol contract changes, so no wiki page needs syncing.
