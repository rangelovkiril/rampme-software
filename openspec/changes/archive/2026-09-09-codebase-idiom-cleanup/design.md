## Context

See proposal.md for motivation. The design-relevant constraints:

- The change spans tooling, both apps, and the shared wire format between them, so ordering matters more than usual: the Biome fix mechanically rewrites 21 of 26 `.tsx` files, and any hand edit to those files made first would be rewritten underneath.
- `/realtime/vehicles` and `/realtime/vehicles/stream` are public cross-origin endpoints on `api.rampme.site`. The frontend is the only known consumer, but it deploys independently of the backend, so a wire-format rename is not atomic.
- `openspec/specs/ramp/reservations/` does not exist despite its capability having been archived. Every other archived capability is synced. This change's delta targets that path, so the sync gap is a hard sequencing dependency, not a cosmetic one.
- `simplify-vehicle-ramp-payload` (#96) lands first. It removes `EnrichedVehicle.ramp_reservations`, `VehicleRampInfo`, and the reservations projection from `services/ramp/status.ts`. Every count in this document is measured against the tree with it applied.
- Backend tests reference members this change removes: `test/gtfs/static.test.ts` asserts on `stopTimes`, and three fixture files set `stopTimes: []`.

## Goals / Non-Goals

**Goals:**

- Make `bun run check` actually cover what the project assumes it covers, so this class of drift cannot silently reaccumulate.
- Close the proximity expiry defect in the same pass that establishes the guard pattern, so the bridge-availability contract holds everywhere rather than in two of three call sites.
- Leave the API's error-response shape byte-identical while moving off raw `Response` returns, so the idiom change carries no wire-format risk of its own.

**Non-Goals:**

- Adding tests for modules that currently lack them beyond what this change's own edits require. Coverage gaps are known and tracked separately.
- Restructuring the large components (`FloatingNav.tsx`, `VehicleTripSheet.tsx`, `StopArrivalsSheet.tsx`) beyond extracting the duplicated trip-info logic. Their state density is a separate concern.
- Replacing the `getX()`/`initX()` module singletons (`getGtfs`, `getRampDb`, `getRampBridge`, `getMqtt`, `getAccessibility`) with Elysia `.state`. Route plugins do take their dependencies as function arguments (see Decisions), which is the composition half of the idiom, but the singletons themselves stay.
- Reducing comment volume as a goal in itself. Measured density is 10 percent, which is reasonable.

## Decisions

**The API speaks camelCase, and the GTFS/SQLite vocabulary stops at a mapping boundary.**

Every field crossing the wire is camelCase. Internal types that mirror an external schema keep that schema's spelling: `Stop`, `Route`, `Trip`, `StopTime`, and `CalendarDate` stay snake_case because they are GTFS columns, and `RampReservation` stays snake_case because those are SQLite column names. The translation happens once, at the response boundary.

This is the larger of the two options and was chosen deliberately. Scope, measured rather than estimated: 43 snake_case fields across 8 response types, and 331 references across 17 frontend files.

It also requires mapping where none exists today. Four routes currently return rows straight through with no transformation at all: `/stops` and `/stops/:id` return `Stop` objects parsed from `stops.txt`, `/routes` returns `Route` objects, and `/ramp/session`, `/ramp/vehicle/:id`, and `POST /ramp/reserve` return `RampReservation` rows cast directly out of `bun:sqlite` (`stmts.sessionActive.all() as RampReservation[]`). Each gains an explicit mapping function. That is new code, and it is the real cost of this decision, but it is also what makes the boundary explicit instead of leaking storage and feed vocabulary into the public API.

The request side moves too: `POST /ramp/reserve`'s body becomes `{ vehicleId, stopId, type }`.

**The rename is sequenced after Eden, not before.** Wiring Eden first means the backend rename makes `tsc` enumerate every stale frontend reference by hand-free exhaustion. Renaming first would leave those 331 references to be found by grep and by eye. This ordering turns the largest and most error-prone part of the change into a compiler-checked worklist.

**The schema is the type. Response shapes are defined once, and the TypeScript type is derived from them.**

Adding `response` schemas next to the existing hand-written interfaces would be the wrong move: `EnrichedVehicle` (`gtfs/enrich.ts:5`) and `EnrichedVehicleSchema` (`routes/realtime.ts:17`) are already the same shape written twice by hand, with nothing linking them, and doing that for the other twelve routes would multiply the problem rather than fix it. `tsc` does catch a mismatch, but only where a `response` schema already exists, and the diagnostic is an unreadable wall of Elysia generics.

Instead, each response shape is declared once as a TypeBox schema, registered with `.model()`, and its TypeScript type is derived with `typeof Schema.static`. The hand-written interface is deleted. Duplication then becomes structurally impossible rather than merely discouraged, because there is only one definition to drift from.

This was verified against the existing code rather than assumed: `typeof Schema.static` over the `ramp_status` union reproduces `RampStatus` exactly in both assignment directions, `t.Nullable` derives to `T | null` rather than `T | undefined`, and `tsc --noEmit` accepts the result unchanged. The pattern is also already in this repository, at `services/ramp/bridge.ts:56` and `hw-sim/src/protocol.ts:17`; it has simply never been used for HTTP. `.model()` additionally caches model types at registration, which helps TypeScript inference, and surfaces the models by name in `/docs`.

**Route plugins take their dependencies as arguments; the module singletons stay.**

Idiomatic Elysia has two competing answers for dependency access: a plugin that is a function receiving its dependencies (`reservationPlugin(db)`), or instance state (`.state('db', db)`). The first is adopted, the second is not, and the reason is specific to this codebase rather than general.

`.state('gtfs', await loadGtfs())` fails here on two counts. It captures a snapshot at construction, but `src/index.ts` refreshes GTFS on `GTFS_REFRESH_INTERVAL` through `setGtfs()`, so a stored value would go stale after the first refresh and never update. It also awaits before the instance is built, whereas the current startup deliberately calls `app.listen()` first and only then `await initGtfs()`, so `/health` answers during the GTFS parse. That ordering is load-bearing: `backend/Dockerfile`'s healthcheck allows a 10s start period before it begins failing, and `/health` is declared independently of GTFS precisely so a slow parse cannot fail the container.

Passing dependencies into the route plugins gets the composition benefit without either problem, and it matches the factory shape `backend/AGENTS.md` already prescribes and `createRampBridge(mqtt, timeoutMs)` already demonstrates.

**Error handling gets a real pipeline, which the app currently lacks entirely.**

There is no `onError` and no `.error()` registration anywhere in `backend/src`, so an unhandled throw returns an untyped 500. Custom error classes registered with `.error()` and one `.onError()` handler replace the ad-hoc `jsonError` returns and the `try`/`catch` blocks in handlers. Each route still declares its error statuses in its `response` schema so the handled bodies stay validated and documented.

**Repeated request validation is expressed with `.guard()` and `.resolve()`, not per-route schemas.**

The session-id check in `routes/ramp.ts` is hand-rolled at three call sites. A `.guard()` carrying the header schema, with a `.resolve()` that exposes a typed `sessionId` to everything beneath it, removes the repetition and the manual parsing in one move, rather than replacing three hand-rolled checks with three declared schemas.

**Error responses keep the `{ "error": string }` shape.**

Replacing `jsonError()` with `status()` is about restoring Elysia's response validation and OpenAPI generation, not about redesigning errors. Every migrated route declares its error `response` schemas as `t.Object({ error: t.String() })` with the same status codes it returns today. This keeps the idiom change non-breaking and makes it reviewable independently of the naming change.

`jsonError()` is removed from `services/state.ts` once no route uses it. That file's remaining job is the GTFS data holder, which is a better fit for its name.

**The frontend derives its types from the backend through Eden, and `frontend/lib/types.ts` is deleted.**

Deriving backend types from schemas removes two of the three copies; the third is `frontend/lib/types.ts`, which no backend change reaches. Eden closes it: the frontend imports `type App = typeof app` from the backend and gets every route's request and response type without writing any.

The obstacle is that Eden requires both sides to see one Elysia instance, and this repository installs Elysia twice (`backend/node_modules/elysia` and, if added, `frontend/node_modules/elysia`). With two copies, `treaty<App>` fails with a nominal mismatch on `config.adapter`, because the two `ElysiaAdapter` declarations are structurally identical but come from different files.

Two ways to give it one instance:

- A Bun workspace at the repository root. Clean in principle, but it hoists dependencies into a single root `node_modules` and a single root `bun.lock`, which breaks `backend/Dockerfile` (its build context is `backend/`, and it does `COPY package.json bun.lock ./`) and all three CI cache keys (`.github/actions/setup-bun` hashes `{app}/bun.lock` and installs per app directory). That is an infrastructure change reaching the image build and the Flux deploy path.
- Frontend declares no `elysia` dependency of its own and maps the specifier to the backend's copy via `tsconfig.json` `paths`. No lockfile changes, no workspace, `backend/Dockerfile` untouched, all three CI cache keys intact.

The second is chosen. It was verified end to end: with `elysia` and `elysia/*` mapped to `../backend/node_modules/elysia`, `bunx tsc --noEmit` passes, and the derived types are real rather than degraded to `any`. Three deliberate errors in a probe (assigning `id` to a `number`, reading a nonexistent field, narrowing `ramp_status` to a value outside its union) were all reported, and the inferred vehicle shape came through complete, including the `"unknown" | "no_ramp" | "working" | "in_use"` literal union.

Notably, that inference came from `/realtime/vehicles`'s `response` schema, the only one that exists today. This is the payoff of the schema-first decision above: once every route declares a `response` schema, the frontend gets all of them for free.

Its one CI consequence is that the frontend's type-check now needs the backend's dependencies present. `.github/actions/setup-bun` installs exactly one app directory, so the frontend workflow gains a second invocation of it for `backend`.

Eden covers HTTP but not `EventSource`, so `hooks/useSSE.ts` stays hand-typed at the transport level. Its payload types still come from the backend, imported directly from the schema models over the same path mapping rather than restated.

**Measured cost of the coupling:** none worth planning around. Frontend `bunx tsc --noEmit` runs in 5.7s with the backend types pulled in against 6.2s without, which is inside run-to-run noise.

**The GTFS-not-ready guard becomes a reusable Elysia construct, not a fourth copy of a helper.**

The three identical `GTFS_NOT_READY` definitions and the repeated `const data = getGtfs(); if (!data) return ...` prologue are the same guard expressed by hand at every route. Expressing it once as an Elysia plugin that resolves the loaded `GtfsData` (or short-circuits with 503) removes both the duplication and the per-handler null check, and it is the framework's intended mechanism. Routes that legitimately tolerate missing data, the SSE handlers that return `null` instead of an error, keep their own check.

**`cleanupOldReservations` gains a caller rather than losing its interface entry.**

It is currently invoked once, at construction. Removing it would delete the only mechanism the reservation table has for bounding its own growth. Scheduling it on an interval alongside the existing periodic work is the smaller and more correct change. Rows it deletes are older than 24 hours and are already invisible to every query in `db/ramp.ts`, so this has no externally observable effect and needs no spec.

**`TZ` moves into `config/index.ts`, and the one time computation that bypasses it is corrected.**

`gtfs/time.ts` funnels every conversion through an `Intl.DateTimeFormat` bound to `TZ`, except that `services/transit/trip-details.ts`'s delay computation calls `Date.getHours()` and `Date.getMinutes()` directly, which use the process's local timezone. These agree only when the container's local timezone already matches `TZ`. Since this change is consolidating the timezone constant anyway, routing that computation through the same helper closes the inconsistency at its source rather than leaving a second, silently divergent notion of local time.

**Environment variables affected by `config/index.ts` changes:** `PROTO_PATH` (removed, no reader), `DEPLOY_TIMEOUT_MS` (unchanged name and `20000` default, moved out of `services/ramp/bridge.ts`), `TZ` (unchanged `Europe/Sofia` default, moved out of `gtfs/time.ts`, documented in `backend/AGENTS.md`'s table for the first time). `PORT`, `GTFS_REFRESH_INTERVAL`, `GTFS_RT_STALE_THRESHOLD_MS`, and `RAMP_ACCESSIBILITY_REFRESH_MS` keep their names and defaults but are parsed through validating helpers, so a malformed value now fails loudly at startup instead of becoming `NaN`.

The ramp MQTT protocol and its topic shapes are untouched, so no firmware compatibility question arises with `rampme-hardware`.

**Biome's findings are resolved by category, not file by file.**

The 78 findings fall into three classes with different risk. `organizeImports` and formatting are mechanical and can be applied wholesale with `biome check --fix`. `noNonNullAssertion`, `noUnusedVariables`, and `noUnusedFunctionParameters` are local and low-risk. `useExhaustiveDependencies` is the only class that can change runtime behavior, since adding a missing dependency makes an effect re-run where it previously did not. Those thirteen are reviewed individually, and each is either fixed by adding the dependency or suppressed with a comment explaining why the omission is deliberate. They are committed separately from the mechanical classes so the reviewable diff is not buried in a 1,300-line reformat.

## Risks / Trade-offs

- **The thirteen `useExhaustiveDependencies` fixes can change effect timing, and the components involved drive the map, the reservation flow, and the SSE subscriptions.** → Fix them in their own commit, run `bun run test:e2e` against that commit specifically, and exercise the map, stop-arrivals, and reservation flows through Playwright before merging. This is the one part of the change that automated checks alone do not clear.

- **This is a genuinely breaking API change across every endpoint, and the two apps do not deploy atomically.** → Unlike the single-field version originally planned, there is no version of this that a stale client survives. The two apps deploy together, and the deploy is the one irreversible-ish step in the change. Mitigated by the fact that the frontend is the only known consumer and Eden makes the client side compiler-verified rather than hand-audited.

- **Eden couples the two apps at build time: a backend response-schema change can now fail the frontend's `tsc`.** → This is the intended guarantee, not a side effect, and it is a build-time coupling only. Runtime independence is unchanged: the frontend is still a static export calling `api.rampme.site` over HTTP, and neither deploy artifact gains a dependency on the other. The practical effect is that a breaking response change is caught in CI instead of in the browser.

- **The `paths` mapping into `../backend/node_modules` is unusual and will look like a mistake to the next reader.** → It carries a comment stating that it exists to give Eden a single Elysia instance, and `frontend/package.json` must never gain its own `elysia` dependency, since that silently reintroduces the two-instance mismatch. Adding a guard for that is cheap and is included as a task.

- **The single-change scope makes for a large PR.** → Accepted deliberately, since splitting it would put the mechanical reformat in conflict with every other frontend edit. Mitigated by committing in the task groups below, so the history reads as reviewable steps even though the PR is one unit.

## Migration Plan

1. `ramp/reservations` spec sync lands first on its own branch.
2. This change is implemented in the task-group order below, committing per group.
3. Backend and frontend deploy together for the camelCase rename, rather than on their usual independent cadence. This is a hard requirement, not a precaution: every response field changes spelling, so a stale frontend against a new backend renders nothing.

> [!WARNING]
> Step 3 was not followed. The frontend reached `rampme.site` while `api.rampme.site` was still on `main`, and the resulting skew is [#112](https://github.com/rangelovkiril/rampme-software/issues/112): opening "Линии" threw on `a.shortName` and took the whole app down to Next.js's default error page, "Спирки" rendered a list of blank rows, and `/ramp/session/stream` answered 422 on every attempt because the backend still required `session_id`. The failure direction observed in production was the mirror of the one anticipated here — a new frontend against a stale backend — and it is the more damaging one, because a crash in a `useMemo` sort is not a degraded render but a blank page.

**Rollback** is a plain revert for everything except the deploy ordering. Nothing here writes a migration, changes a SQLite schema, alters an MQTT topic, or touches a Cloudflare or cluster resource. The one caveat is that reverting the backend alone after both have shipped reintroduces the naming mismatch in the opposite direction, so a rollback that crosses the rename reverts both apps together.
