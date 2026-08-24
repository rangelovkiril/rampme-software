## Context

See proposal.md - Why. Current state, concretely: `e2e/fixtures/transit.ts` exports module-level constants `stop`, `vehicle`, `arrivals`, `trip` and one function `mockTransitApi(page)` that registers a single `page.route('**/api/**', ...)` handler with a flat `if`-chain, closing over those constants. `transit.spec.ts` and `mobile-sheets.spec.ts` both import the constants directly and inline-select the stop/vehicle sheet via `page.locator('section.stop-sheet-shell').filter({ hasText: ... })`. `mobile-sheets.spec.ts` additionally sets `test.use({ ...devices['Pixel 7'] })` at the top of the file. Only these two spec files and this one fixture file exist under `frontend/e2e/` today.

## Goals / Non-Goals

**Goals:**
- Fixture data (`stop`, `vehicle`, `arrivals`, `trip`) becomes factory functions with per-test overrides, without changing what the two existing specs assert.
- The route handler splits along the same domain vocabulary already established for `backend/src` (`ramp`, `stops`, `transit`), each domain owning its slice of `ApiMockState`.
- Common locators move into a page-object layer that stays decoupled from the factory shape.
- `mobile-sheets.spec.ts` runs under a dedicated Playwright `mobile` project instead of an inline `test.use()`.
- Both existing specs pass unchanged (same assertions, same behavior) after all four pieces land.

**Non-Goals:**
- No new e2e scenarios/specs are added by this change - #50-#53 asked for the *infrastructure* to make future scenarios cheap, not new coverage. New specs using the factories/page-objects/mobile project are follow-up work.
- No application code changes (`frontend/app`, `components`, `contexts`, `hooks`).
- No change to `ApiMockState`'s externally-observed shape (`reservations`, `reserveRequests`, `cancelledIds`, `rampSessionIds`, `unhandledRequests`) - specs read these fields today and must keep doing so unchanged.

## Decisions

**Order: factories (#50) before domain split (#51), always in that sequence.** `mockTransitApi` currently closes over module-level constants. If the domain split lands first, each domain handler gets wired around the current fixed constants, and turning those into factories afterward means revisiting every domain handler's signature a second time. Landing factories first means the domain split has a settled shape to split around: each domain registration function receives already-built fixture objects as parameters, not module-level names.

**Domain names: `ramp`, `stops`, `transit` - not `realtime`.** Issue #51 proposed `/api/ramp/*`, `/api/realtime/*`, `/api/stops/*`. `openspec/config.yaml`'s own capability-path rule ties capability naming to `backend/src`'s domain folders: `gtfs`, `ramp`, `transit`, `stops`. The vehicles/trip/ETA endpoints this domain covers (`/api/realtime/vehicles`, `/api/realtime/vehicles/:id/trip`, etc.) are served by `backend/src/services/transit/`, so the e2e mock's domain module is named `transit`, matching the backend vocabulary instead of the route prefix. The route *prefix* (`/api/realtime/...`) is unaffected - only the internal module/function naming changes.

**Page objects are shallow, not fixture-aware.** `StopSheet`/`FloatingNav` take a `Page` and the plain matcher value each spec already has on hand (a stop name string, a vehicle id string) - not the fixture object itself (e.g. `new StopSheet(page, stop.stop_name)`, not `new StopSheet(page, stop)`). This keeps `e2e/pages/` from depending on the factory module's output shape at all: a page object only needs to know how to find a sheet by its displayed text, never what a `Stop` or `Vehicle` looks like. Alternative considered: fixture-aware page objects taking the built domain object directly - rejected because it couples the page-object layer to whatever `createStop`/`createVehicle` produce, meaning a future factory field rename would ripple into `e2e/pages/` for no locator-finding benefit.

**`ApiMockState` composition: each domain module returns its own state slice; `mockTransitApi` merges them.** E.g. `registerRampRoutes(page, sessionId)` returns `{ reservations, reserveRequests, cancelledIds, rampSessionIds }`; `registerStopsRoutes(page, stop, arrivals)` and `registerTransitRoutes(page, vehicle, trip)` return their own slices (currently empty beyond what's already tracked - `unhandledRequests` stays owned by the composing `mockTransitApi`, since it's cross-cutting, not domain-specific). This keeps each domain module free of knowledge about the other domains' state while preserving `ApiMockState`'s existing external shape.

**Single change, not four.** #50/#51/#52 form one causal chain touching the same file (`transit.ts`) plus a new sibling directory (`e2e/pages/`); splitting them into three separate OpenSpec changes would mean validating "existing specs keep passing unchanged" three times against intermediate, not-yet-final states. #53 (`playwright.config.ts`, the `mobile` project) is independent of the fixture/page-object work but small enough to fold in as its own task group rather than spin up a second proposal/design/tasks trail for one config block. This mirrors `ci-test-enforcement` from PR #68, which bundled several related-but-separable CI facets into one change rather than one-change-per-facet.

**Task order:** factories (#50) -> domain split (#51) -> page objects (#52) -> mobile project (#53). #52 could in principle move earlier (it's decoupled from #50/#51 per the shallow-page-object decision above) but sequencing it after the fixture/handler split avoids two people (or the same session at different times) editing `transit.spec.ts`/`mobile-sheets.spec.ts` concurrently for unrelated reasons; #53 has no ordering constraint with the other three and could run in parallel, but is sequenced last for the same single-editor-at-a-time reason.

## Risks / Trade-offs

- [Domain split changes the shape of what closes over what] -> Mitigated by writing factories first (see Decisions), so the split has a fixed target instead of a moving one.
- [Renaming the internal `realtime` vocabulary to `transit` could be mistaken for a route path change] -> The task for #51 must state explicitly that only the internal module name changes, not the `/api/realtime/*` route prefix the frontend actually calls.
- [Splitting one flat route handler into composed per-domain handlers could change request-matching order and break `unhandledRequests` fallback behavior] -> `mockTransitApi` keeps composing all domain registrations before the `unhandledRequests`/404 fallback, exactly as today's single `if`-chain falls through to it last; task includes running both specs after each of #50/#51/#52 lands (not just once at the end) to catch an ordering regression early even though the change lands as a single PR.
- [Shallow page objects] -> Trade-off, not a risk: callers must still know the matcher string (`stop.stop_name`, `vehicle.id`) themselves rather than getting it "for free" from a fixture-aware object. Accepted per the Decisions rationale above.

## Migration Plan

Pure test-code refactor, no production deploy, no feature flag, no environment variables affected, no `config/index.ts` changes. Rollback is a plain `git revert` of the PR - the change touches only `frontend/e2e/**` and `frontend/playwright.config.ts`, neither of which ships in the static export (`frontend/e2e/` is excluded from `bun run build`'s `out/`). Landing order within the single PR: #50 -> #51 -> #52 -> #53, running `bun run test:e2e` after each step to confirm `transit.spec.ts` and `mobile-sheets.spec.ts` keep passing unchanged before moving to the next.
