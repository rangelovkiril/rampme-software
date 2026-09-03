## Why

CI runs tests but has real gaps in how much it actually enforces around them, found by direct inspection of `.github/workflows/*.yaml` and by reproducing behavior locally (`bun test`'s handling of `.only()`, zero-match filters, and its unused `--coverage`/`--reporter=junit` flags). None are hypothetical: the clearest is that `frontend.yaml`'s `e2e` job is not a dependency of `deploy-staging`, so a red Playwright suite does not block a production deploy of a feature whose core purpose is triggering physical hardware. Bundling all of it into one change rather than splitting by severity, since a handful of small CI edits split across several changes tends to leave most of them sitting half-landed for a long time — this is one PR touching three workflow files once.

## What Changes

- `frontend.yaml`: `deploy-staging` gains `e2e` as a `needs` dependency (alongside the existing `build`), so a failing e2e run blocks both staging and production (the latter already transitively, via `deploy-production`'s existing `needs: deploy-staging`). **BREAKING** (process only): a currently-passing merge to `main` could now be blocked by a flaky or newly-broken e2e spec that previously would not have stopped deployment.
- `frontend.yaml`'s `e2e` job caches Playwright's browser binaries (keyed on the Playwright version) instead of reinstalling Chromium on every run.
- `playwright.config.ts`'s `reporter` gains the built-in `'github'` reporter, so a failing e2e assertion annotates the exact line on the PR diff instead of only appearing in the raw job log.
- Verify (and fix if needed) that `trace: 'retain-on-failure'` traces are actually reachable from the uploaded `playwright-report/` artifact, not left behind in an unuploaded `test-results/` directory.
- `backend.yaml`, `frontend.yaml` (unit step), `hw-sim.yaml`: each `bun test` step gains `--coverage --coverage-reporter=text` (printed to the job log; not a gating threshold — see design.md) and `--reporter=junit --reporter-outfile=...` feeding a GitHub-annotation step, so a failing backend/hw-sim assertion also annotates the PR diff, mirroring the Playwright fix above.
- `backend/biome.json`, `frontend/biome.json`, `hw-sim/biome.json`: `suspicious/noFocusedTests`/`suspicious/noSkippedTests` set to `"error"` (bun:test has no built-in equivalent to Playwright's `forbidOnly`, but Biome — already run in every `check`/`build` job — has native rules for exactly this), so a committed `.only(`/`.skip(` doesn't silently narrow the suite to one test. No new CI step needed; the existing `bunx biome check .` step catches it.
- Software wiki's CI/CD page updated to describe the new deploy-gating relationship and the failure-annotation additions, per root `AGENTS.md`'s doc-sync rule.

## Capabilities

No spec-level product behavior changes — this is CI/CD pipeline configuration, which this project's convention documents in the wiki rather than as an OpenSpec capability (see `openspec/specs/` — none of the existing capabilities describe pipeline behavior). `skip_specs: true`.

### New Capabilities
(none)

### Modified Capabilities
(none)

## Impact

- `.github/workflows/frontend.yaml`: `deploy-staging`'s `needs`, `e2e` job's cache step, new junit/coverage step on the unit-test step.
- `.github/workflows/backend.yaml`, `.github/workflows/hw-sim.yaml`: `check` job's `bun test` step gains coverage + junit reporting.
- `frontend/playwright.config.ts`: `reporter` array gains `'github'`.
- `backend/biome.json`, `frontend/biome.json`, `hw-sim/biome.json`: `suspicious/noFocusedTests`/`suspicious/noSkippedTests` set to `"error"` (see Modified Capabilities note above — this is the `.only()`/`.skip()` guard, enforced through the existing Biome check rather than a new CI step).
- Software wiki's **CI/CD** page (per root `AGENTS.md`: "architecture, threat model, CI/CD, ramp MQTT protocol, contributing" live there) — updated in the same change, tracked as its own task per this project's wiki-sync convention.
- No application code changes, no env vars, no infrastructure/deployment topology changes beyond the added `needs` edge.
