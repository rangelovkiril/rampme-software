## Why

`frontend/e2e/fixtures/transit.ts` was written for 2 spec files and already mixes two concerns in one place: fixed-constant domain data (`stop`, `vehicle`, `arrivals`, `trip`) and a single flat `if`-chain route handler (`mockTransitApi`) that closes over them. Every new e2e scenario (a stop without a ramp, an already-reserved seat, an error response) needs its own data variant and adds another branch to the chain. `transit.spec.ts` and `mobile-sheets.spec.ts` also duplicate the same stop-sheet locator inline. None of this blocks today's 2 specs, but growing the suite without addressing it means each new spec both duplicates fixture data and lengthens an already-flat conditional. Issues #50, #51, #52 (tracked separately) each name one facet of this; landing them independently risks reworking #50/#51's fixture shape once #52's page-object layer needs to consume it.

## What Changes

- `e2e/fixtures/transit.ts`'s `stop`, `vehicle`, `arrivals`, `trip` become factory functions (`createStop(overrides)`, `createVehicle(overrides)`, etc.) returning current defaults merged with per-test overrides.
- `mockTransitApi`'s single `/api/**` handler splits into per-domain registration functions, named after the domain vocabulary this repo already uses for `backend/src` (`ramp`, `stops`, `transit` — not `realtime`), each owning its slice of `ApiMockState`, composed together in `mockTransitApi`.
- A shallow page-object layer under `e2e/pages/` (`StopSheet`, `FloatingNav`) wraps the locators `transit.spec.ts` and `mobile-sheets.spec.ts` currently inline (e.g. `page.locator('section.stop-sheet-shell').filter({ hasText: ... })`), parameterized by the plain matcher string/id each spec already has on hand — not by the fixture objects themselves, keeping the page-object layer decoupled from the factory shape.
- `playwright.config.ts` gains a `mobile` project (`devices['Pixel 7']`); `mobile-sheets.spec.ts` drops its inline `test.use({ ...devices['Pixel 7'] })` in favor of running under that project.
- No application code under `frontend/app`, `frontend/components`, `frontend/contexts`, or `frontend/hooks` changes. No spec-level product behavior changes — this is test-infrastructure only.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None — this is a pure test-tooling refactor with no product-behavior change. `.openspec.yaml` sets `skip_specs: true`.

## Impact

- `frontend/e2e/fixtures/transit.ts` — factories + per-domain (`ramp`/`stops`/`transit`) route registration, replacing the current fixed constants and flat `if`-chain.
- `frontend/e2e/pages/` (new) — `StopSheet`, `FloatingNav` page objects.
- `frontend/e2e/transit.spec.ts`, `frontend/e2e/mobile-sheets.spec.ts` — updated to use the factories and page objects; both must keep passing unchanged throughout.
- `frontend/playwright.config.ts` — new `mobile` project; `mobile-sheets.spec.ts`'s inline `test.use()` override removed.
- Supersedes GitHub issues #50, #51, #52, #53 (closed on merge, not referenced in spec deltas since none exist).
