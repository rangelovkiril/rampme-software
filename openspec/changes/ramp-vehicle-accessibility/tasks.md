## 1. Reference data (backend)

- [x] 1.1 Move `sofia_transport_low_floor.json` into `backend/src/gtfs/model-accessibility.json` (not `backend/data/` — that directory is gitignored runtime state, wrong home for a curated source file) and correct the only real mismatch against trinmo's own `specifications.accessibility` field (Waggon AG Be 4-6 → `false`; Т8М-700/M and Т8М-700IT already matched once "partial/mixed → not-equipped" is applied, no change needed there — see design.md Decisions); verified by re-diffing all 14 rows with a `specifications.accessibility` value against the file: zero disagreements.
- [x] 1.2 Write `backend/scripts/refresh-accessibility.ts` (+ `backend/scripts/trinmo-schemas.ts` for TypeBox validation of trinmo's untrusted response shapes, per the repo's untrusted-input rule): fetches trinmo's active-model list per type, fetches each model's detail page, extracts `images[].vehicles[]`, joins via `buildAccessibilityTable`, writes to a configurable output path; verified by running it live: 49/49 models fetched, 546 BUS + 256 TRAM + 151 TROLLEY vehicles resolved, and all 8 previously-validated live vehicle IDs resolved to `true` as expected.
- [x] 1.3 Extracted the join/filter logic into `backend/src/gtfs/accessibility-table.ts`'s pure `buildAccessibilityTable()`, covered by `backend/test/gtfs/accessibility-table.test.ts` (8 cases: resolution, false vs. omitted, in-service filtering, unknown-model/unlisted-model non-guessing, type separation, conflict handling, empty input); verified with `bun run test` — all pass.

## 2. Backend enrichment

- [x] 2.1 Add `RAMP_ACCESSIBILITY_DATA_PATH` (default `./data/vehicle-accessibility.json`) and `RAMP_ACCESSIBILITY_REFRESH_MS` (default `3600000`) to `backend/src/config/index.ts`; verified by reading `config.rampAccessibility` — matches the other `rampDbPath`-style env-backed defaults in the same file.
- [x] 2.2 Added `backend/src/gtfs/accessibility.ts`: `createAccessibilityResolver(dataPath, refreshMs)` (DI-factory, mirrors `createRampDb`/`createRampBridge`) loads the file at startup, reloads on the interval, and exposes `resolve(vehicleId): boolean | null` (strip `A`/`TM`/`TB` prefix → inventory → type-scoped lookup); `initAccessibility()`/`getAccessibility()` wire the production singleton, called from `index.ts`. Verified with `bun run test`.
- [x] 2.3 Wired `resolveAccessibility` into `gtfs/enrich.ts` (new 4th param, replacing `trip?.wheelchair_accessible === 1`) and `routes/realtime.ts` (passes `getAccessibility().resolve`). **Scope note surfaced during implementation**: satisfying the spec's "Three distinguishable accessibility states" requirement needed a real code change beyond "thread hasRamp through" — `RampStatus` only had `unknown`/`working`/`in_use`, so a confirmed-not-equipped vehicle (`hasRamp === false`) had nowhere to go but `unknown`, silently erasing the distinction the whole feature exists to make. Added a 4th literal, `no_ramp`, to `RampStatus` (`services/ramp/status.ts`), updated `EnrichedVehicleSchema`'s union (`routes/realtime.ts`) and the `has_ramp=true` filter (now `working`/`in_use` only, no longer `!== 'unknown'`). Added `test/services/ramp/status.test.ts` (6 cases) and `test/gtfs/enrich.test.ts` (4 cases, including a resolved-equipped and a resolved-not-equipped vehicle); `bun run test` and `bun run check` both pass.
- [x] 2.4 Updated `backend/AGENTS.md`'s environment variable table with `RAMP_ACCESSIBILITY_DATA_PATH` and `RAMP_ACCESSIBILITY_REFRESH_MS`.

## 3. Frontend visualization

- [ ] 3.1 Extend `frontend/components/layers/VehiclesLayer.tsx` marker rendering so ramp-equipped, not-equipped, and unknown vehicles are visually distinguishable on the map itself (not only in the detail sheet); verify manually via `bun run dev` against vehicles in each state.
- [ ] 3.2 Extend `frontend/e2e/fixtures/transit.ts` with vehicles covering all three states and add/extend a Playwright test asserting the marker distinction; verify with `bun run test:e2e`.

## 4. Infra (fleet repo — cross-repo, tracked here for plan completeness)

- [ ] 4.1 Add a `CronJob` manifest to the `fleet` repo running the backend image's `refresh-accessibility` script on a weekly schedule, writing to a mounted `PersistentVolume`; verify by triggering a manual `Job` run and inspecting the volume's contents.
- [ ] 4.2 Mount the same volume read-only on the backend `Deployment` at the path matching `RAMP_ACCESSIBILITY_DATA_PATH`; verify the running pod can read the file (`kubectl exec` + `cat`, or a log line on load).
- [ ] 4.3 Add a fleet wiki runbook entry documenting the CronJob, its schedule, and the mounted volume, as its own explicit step (not folded into a code task).

## 5. Demo readiness (2026-09-10)

- [ ] 5.1 Run `refresh-accessibility.ts` once now against production trinmo data and deploy its output ahead of the CronJob landing, so the demo has real data before task group 4 ships; verify `GET /realtime/vehicles` returns a non-`unknown` `ramp_status` for at least some live vehicles.
- [ ] 5.2 Run a larger daytime validation pass (broad live `vehicle-positions` capture vs. the reference dataset) and record the match rate; not blocking for the demo, but should happen before or shortly after it (see design.md Risks).
