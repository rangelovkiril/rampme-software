## 1. Fixture factories (#50)

- [x] 1.1 Replace the module-level `stop` constant in `frontend/e2e/fixtures/transit.ts` with `createStop(overrides?: Partial<Stop>)`, returning today's values as defaults; verify by running `bun run test:e2e` and confirming `transit.spec.ts`/`mobile-sheets.spec.ts` still pass with the call sites updated to `createStop()`.
- [x] 1.2 Replace `vehicle` with `createVehicle(overrides?)`, `arrivals` with `createArrivals(overrides?)`, and `trip` with `createTrip(overrides?)`, each returning current defaults; verify the same way.
- [x] 1.3 Update `mockTransitApi` to call the factories internally (`createStop()`, `createVehicle()`, etc.) instead of referencing the removed module-level constants; verify `bun run test:e2e` passes unchanged.
- [x] 1.4 Update `transit.spec.ts` and `mobile-sheets.spec.ts` imports from the removed constants (`stop`, `vehicle`) to the factory-produced values they need for assertions (e.g. `createStop()` for `stop.stop_name`); verify `bun run check` (biome + tsc) and `bun run test:e2e` both pass.

## 2. Domain-split route handlers (#51)

- [x] 2.1 Extract `registerStopsRoutes(page, state)` from `mockTransitApi` covering `/api/stops` and `/api/stops/:id/vehicles(/stream)`, returning its slice of `ApiMockState`; verify `bun run test:e2e` passes with `mockTransitApi` composing this registration.
- [x] 2.2 Extract `registerTransitRoutes(page, state)` covering `/api/realtime/vehicles(/stream)` and `/api/realtime/vehicles/:id/trip(/etas)` — named `transit` per design.md's Decisions (matches `backend/src/services/transit/`), not `realtime`; the `/api/realtime/*` route prefix itself is unchanged, only the internal module/function name. Verify `bun run test:e2e` passes.
- [x] 2.3 Extract `registerRampRoutes(page, state, sessionId)` covering `/api/ramp/session(/stream)` and `/api/ramp/reserve(/:id)`, including the existing `x-session-id`/`session_id` validation behavior; verify `bun run test:e2e` passes, in particular the reservation round-trip assertions in `transit.spec.ts`.
- [x] 2.4 Rewrite `mockTransitApi` to compose the three domain registrations plus the existing basemap-tile stub, keeping the `unhandledRequests` fallback last so unmatched requests still 404 the same way; verify `bun run test:e2e` passes and `api.unhandledRequests` assertions in both specs still resolve to `[]`.

## 3. Page-object layer (#52)

- [x] 3.1 Add `frontend/e2e/pages/StopSheet.ts` wrapping the `section.stop-sheet-shell` locator and its resize-handle/height helpers currently duplicated in `mobile-sheets.spec.ts`, constructed from `(page, matcherText: string)` per design.md's shallow-page-object decision (no fixture-object parameter); verify by using it in place of the inline locator in one spec and confirming `bun run test:e2e` passes.
- [x] 3.2 Add `frontend/e2e/pages/FloatingNav.ts` wrapping the `[data-floating-nav]` reservation-banner locator used in `transit.spec.ts`; verify `bun run test:e2e` passes with the spec updated to use it.
- [x] 3.3 Update `transit.spec.ts` and `mobile-sheets.spec.ts` to use `StopSheet`/`FloatingNav` instead of inline `page.locator(...)` calls, removing the now-duplicated `dragVertically`/`heightOf` helpers from `mobile-sheets.spec.ts` in favor of `StopSheet`'s methods; verify `bun run check` and `bun run test:e2e` both pass with identical assertions to before this change.

## 4. Playwright mobile project (#53)

- [x] 4.1 Add a `mobile` project to `frontend/playwright.config.ts` using `devices['Pixel 7']`, matched by a naming convention (e.g. `testMatch: '**/*.mobile.spec.ts'`) that fits `mobile-sheets.spec.ts`'s existing name without a rename; verify `bunx playwright test --list` shows `mobile-sheets.spec.ts` scheduled under the `mobile` project and not under `chromium`.
- [x] 4.2 Remove the inline `test.use({ ...devices['Pixel 7'] })` from `mobile-sheets.spec.ts`; verify `bun run test:e2e` runs it under the new `mobile` project with identical pass/fail behavior to before.

## 5. Final verification

- [x] 5.1 Run `bun run check` and `bun run test:e2e` once more against the fully composed change (all of #50-#53 landed together) and confirm `transit.spec.ts` and `mobile-sheets.spec.ts` pass with no assertion changes from what they asserted before this change started.
