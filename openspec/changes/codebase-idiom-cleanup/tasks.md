## 1. Prerequisites

- [x] 1.0 Confirm `simplify-vehicle-ramp-payload` (#96) is merged and archived before starting; this change's field counts assume `ramp_reservations` and `VehicleRampInfo` are already gone.

- [x] 1.1 On its own branch, sync the `ramp/reservations` capability from `openspec/changes/archive/2026-09-03-ramp-reserve-without-mqtt/specs/ramp/reservations/spec.md` into `openspec/specs/ramp/reservations/spec.md`, and verify `openspec/specs/ramp/reservations/spec.md` exists with its three archived requirements and a real (non-`TBD`) Purpose. This change's delta cannot be archived until it lands.

## 2. Frontend tooling (do first, it rewrites most `.tsx` files)

- [x] 2.1 Add `"**/*.tsx"` to `files.includes` in `frontend/biome.json`, and verify `bunx biome check .` now reports 41 files checked instead of 18.
- [x] 2.2 Apply the mechanical fixes with `bunx biome check --fix .` (formatting and `organizeImports` only) and commit alone, verifying `git diff --stat` touches only `.tsx` files and `bunx tsc --noEmit` still passes.
- [x] 2.3 Resolve the local lint classes (`noNonNullAssertion`, `noUnusedVariables`, `noUnusedFunctionParameters`, `noArrayIndexKey`, `noShadowRestrictedNames`, `noGlobalIsNan`) and verify those rules report zero findings.
- [x] 2.4 Resolve the a11y classes (`noSvgWithoutTitle`, `noStaticElementInteractions`, `useKeyWithClickEvents`, `noDangerouslySetInnerHtml`) by adding titles and keyboard handlers rather than suppressions, and verify with a Playwright accessibility-tree snapshot that the affected controls expose an accessible name.
- [x] 2.5 Review each of the 13 `useExhaustiveDependencies` findings individually, either adding the missing dependency or suppressing it with a comment stating why the omission is deliberate; commit separately from 2.2 and verify `bun run test:e2e` passes on this commit specifically.
- [x] 2.6 Verify `bun run check` in `frontend/` passes clean with the widened config.

## 3. Backend

> Sequencing note: tasks 4.3 and 4.4 (Eden wiring) land before task 3.14 (the camelCase rename). With Eden in place the rename makes `tsc` enumerate every stale frontend reference, turning task 4.8 into a compiler-checked worklist instead of a grep.

- [x] 3.1 Guard the `getBridge()` call in `services/ramp/proximity.ts`'s `tick()` so an unavailable bridge skips only the deploy publish, and verify with a new test that a due reservation reaches `expired` when the bridge is uninitialized and that `tick()` does not reject.
- [x] 3.2 Add a test that a reservation which cannot be advanced does not prevent a second due reservation from expiring in the same pass, covering the spec's "one reservation's outcome does not suppress another's" requirement.
- [x] 3.3 Add validating helpers to `config/index.ts` (mirroring `hw-sim/src/config.ts`'s `positiveInt`/`port`), move `DEPLOY_TIMEOUT_MS` out of `services/ramp/bridge.ts` and `TZ` out of `gtfs/time.ts` into it, remove the unused `protoPath`, and verify a malformed `PORT` now fails at startup with a named error instead of yielding `NaN`.
- [x] 3.4 Route `services/transit/trip-details.ts`'s delay computation through `gtfs/time.ts`'s timezone-aware helper instead of `Date.getHours()`/`getMinutes()`, and verify with a test that delay minutes are correct when the process timezone differs from `TZ`.
- [x] 3.5 Replace the three identical `GTFS_NOT_READY` helpers and the repeated `getGtfs()` null-check prologue with one Elysia plugin that resolves loaded `GtfsData` or short-circuits with 503, leaving the SSE handlers' own `null` returns intact; verify every non-SSE route still returns 503 with `{"error":"GTFS data not yet loaded"}` before GTFS loads.
- [x] 3.6 Create a schema module registering every request and response shape as TypeBox models via `.model()`, deriving each TypeScript type with `typeof Schema.static`, and delete the hand-written `EnrichedVehicle`, `ArrivalResult`, `TripStopResult`, `TripDetailResult`, and `TripEtaUpdate` interfaces; verify no response shape is declared twice anywhere and `bunx tsc --noEmit` passes.
- [x] 3.7 Migrate all route error returns from `services/state.ts`'s `jsonError()` to `status()`, reference the registered models for all thirteen routes' `response` schemas with error bodies typed as `t.Object({ error: t.String() })`, remove `jsonError()`, and verify the error status codes and bodies are byte-identical to before.
- [x] 3.8 Replace the session-id check hand-rolled at three call sites in `routes/ramp.ts` with a single `.guard()` carrying the header schema plus a `.resolve()` that exposes a typed `sessionId` to every route beneath it; verify the three routes no longer parse headers themselves and that a malformed session id still yields 400.
- [x] 3.9 Validate `params` with TypeBox, replacing the `Number.isFinite` check on `params.id` in `routes/ramp.ts`'s DELETE with `t.Numeric()`; verify a non-numeric id still yields 400.
- [ ] 3.10 Extract the duplicated inline schemas into shared models: the vehicle-filter query object repeated in `routes/realtime.ts` and the `limit` clamp repeated verbatim in `routes/stops.ts`, expressed as `t.Numeric({ minimum: 1, maximum: 50, default: 20 })`; verify out-of-range and non-numeric `limit` values still clamp or reject as before.
- [ ] 3.11 Remove the `try`/`catch` blocks around synchronous `Map` lookups in `routes/transit.ts` and verify `bun run test` still passes.
- [ ] 3.12 Remove the dead members: `GtfsData.stopTimes`, `GtfsData.shapes`, `StopTime.departure_time`, `Trip.direction_id`, `Stop.wheelchair_boarding`, and `MQTTHub.disconnect()`, updating `gtfs/static.ts`'s parsing, `test/gtfs/static.test.ts`'s assertion, and the three fixtures that set `stopTimes: []`; verify `bunx tsc --noEmit` and `bun run test` pass.
- [ ] 3.13 Schedule `RampDb.cleanupOldReservations` on an interval in `src/index.ts` alongside the existing periodic work, and verify with a test that rows older than 24 hours are deleted without a restart.
- [ ] 3.14 Rename every response field to camelCase in the registered models (the single definitions, after 3.6), covering all 43 snake_case fields across the 8 response types, and verify `GET /realtime/vehicles`, `/stops/:id/vehicles`, and `/realtime/vehicles/:id/trip` emit camelCase against a running dev server.
- [ ] 3.15 Add explicit response-mapping functions for the four routes that currently return rows straight through (`/stops` and `/stops/:id` returning GTFS `Stop`, `/routes` returning `Route`, and the three ramp routes returning `RampReservation` cast out of `bun:sqlite`), keeping `Stop`/`Route`/`Trip`/`StopTime`/`CalendarDate` and `RampReservation` snake_case internally; verify each route's response matches its declared model and `bun run test` passes.
- [ ] 3.16 Rename `POST /ramp/reserve`'s request body to `{ vehicleId, stopId, type }` and verify a request with the old spelling is now rejected by the body schema.
- [ ] 3.17 Replace the stale comment references in `gtfs/types.ts` (both the archived `openspec/changes/ramp-vehicle-accessibility` path and the removed `scripts/refresh-accessibility.ts`) and `services/ramp/status.ts` with `openspec/specs/ramp/vehicle-accessibility`, and trim the `services/ramp/bridge.ts` header block and `gtfs/static.ts`'s `parseCsv` JSDoc to what the wiki and the signature do not already state.
- [ ] 3.18 Add custom error classes registered with `.error()` and a single `.onError()` handler, replacing the ad-hoc 404/502 returns scattered through the handlers; the app currently registers no `onError` at all, so an unhandled throw yields an untyped 500. Verify a thrown not-found produces the same 404 body as today and that an unexpected throw produces a typed 500.
- [ ] 3.19 Verify `bun run check` and `bun run test` pass in `backend/`.

## 4. Frontend

- [ ] 4.1 Extract the duplicated primary/secondary trip-info logic in `components/ui/FloatingNav.tsx` into one reusable hook covering the trip fetch, the ETA-merge loop, and the SSE subscription; verify the file shrinks by roughly 110 lines and that both boarding and alighting ETAs still update live in Playwright.
- [ ] 4.2 Reuse that hook in `components/sheets/VehicleTripSheet.tsx` for its own copy of the ETA-merge loop, and verify the vehicle trip sheet still updates ETAs live.
- [ ] 4.3 Export `type App = typeof app` from `backend/src/index.ts`, add `@elysiajs/eden` to `frontend/package.json`, and map `@backend/*` plus `elysia` and `elysia/*` to the backend's copy in `frontend/tsconfig.json` `paths` with a comment stating the mapping exists to give Eden a single Elysia instance; verify `bunx tsc --noEmit` passes in `frontend/`.
- [ ] 4.4 Verify the derived types are real and not `any` by temporarily assigning a response field to a wrong type, reading a nonexistent field, and narrowing `ramp_status` outside its union, confirming `tsc` reports all three, then remove the probe.
- [ ] 4.5 Replace the thirteen endpoint literals with an Eden `treaty<App>` client beside `lib/config.ts`, deduplicating the independent `/stops` fetches in `components/layers/StopsLayer.tsx` and `components/panels/StopsPanel.tsx`; verify with Playwright network inspection that `/stops` is requested once per load and that the app still functions against a running backend.
- [ ] 4.6 Type `hooks/useSSE.ts`'s payloads by importing the backend's schema-derived models over the `@backend/*` mapping, since Eden does not cover `EventSource`; verify the SSE call sites no longer reference any locally declared payload type.
- [ ] 4.7 Delete `frontend/lib/types.ts` and update `e2e/fixtures/transit.ts` to the derived types; verify `bunx tsc --noEmit` passes with no hand-written response type remaining in `frontend/`.
- [ ] 4.8 Update all 331 snake_case field references across the 17 affected frontend files to camelCase, working from the list `bunx tsc --noEmit` produces after the backend rename in 3.14 rather than from grep; verify `tsc` reports zero errors and `bun run test:e2e` passes.
- [ ] 4.9 Update `contexts/RampContext.tsx`'s `apiReserve()` body to `{ vehicleId, stopId, type }` and the `reserveRequests` assertion in `e2e/fixtures/transit.ts` to match task 3.16; verify the reservation flow works end to end in Playwright.
- [ ] 4.10 Add a guard that fails if `frontend/package.json` ever declares its own `elysia` dependency, since a second instance silently breaks Eden's type derivation; verify the guard fails when `elysia` is temporarily added and passes when it is removed.
- [ ] 4.11 Rename `components/ui/ResBanner.tsx`, `ResDetailCard.tsx`, and `NavBtn.tsx` to spelled-out names matching their siblings, updating all importers; verify `bunx tsc --noEmit` passes and `bun run test:e2e` still passes.
- [ ] 4.12 Replace the stale `openspec/changes/ramp-vehicle-accessibility` references in `components/layers/VehiclesLayer.tsx` and `e2e/transit.spec.ts` with `openspec/specs/ramp/vehicle-accessibility`.
- [ ] 4.13 Verify `bun run check`, `bun run test`, and `bun run test:e2e` pass in `frontend/`.

## 5. Documentation

- [ ] 5.1 Update `backend/AGENTS.md`'s environment variable table: remove the `PROTO_PATH` row, add a `TZ` row (default `Europe/Sofia`), and note that `DEPLOY_TIMEOUT_MS` is now read through `config/index.ts`.
- [ ] 5.2 Update `backend/AGENTS.md`'s file-tree and Key-concepts sections for the removed `GtfsData` members, the removed `jsonError()`, and the new GTFS-ready plugin, so the described structure matches the code.
- [ ] 5.3 Add a second `.github/actions/setup-bun` invocation with `working-directory: backend` to both jobs in `.github/workflows/frontend.yaml`, since the frontend type-check now needs the backend's dependencies present; verify the frontend workflow passes in CI.
- [ ] 5.4 Update the root `AGENTS.md` testing paragraph to state that frontend Biome now covers `.tsx`, so the next reader does not re-derive the gap.
- [ ] 5.5 Add a third clause to the root `AGENTS.md`'s typing rule stating that outgoing response shapes are defined once as a TypeBox model and their TypeScript type derived with `Static<>`, never written as a parallel interface, and note in `backend/AGENTS.md` that the frontend derives its types from these models through Eden; this is what stops the duplication from returning.
- [ ] 5.6 Confirm no wiki page needs syncing: the ramp MQTT protocol, CORS origins, deployment path, and request path are unchanged by this change.

## 6. Verification

- [ ] 6.1 Run `bun run check` and `bun run test` in `backend/`, `frontend/`, and `hw-sim/`, plus `bun run test:e2e`, and confirm all pass.
- [ ] 6.2 Start the backend with `MQTT_URL` unset, create a reservation, and confirm the proximity loop logs no `Ramp bridge not initialized` errors and that the reservation expires on schedule.
- [ ] 6.3 Exercise the map, stop-arrivals, vehicle-trip, and ramp reservation flows in Playwright at both desktop and mobile viewports, confirming no regression from the effect-dependency fixes in task 2.5.
- [ ] 6.4 Confirm `/docs` renders response schemas for all thirteen routes.
