## Context

See proposal.md - Why for the finding list. Current state, confirmed by inspecting `.github/workflows/*.yaml` and by reproducing locally:

- `backend.yaml`/`hw-sim.yaml`: `check` job (`biome check` + `tsc --noEmit` + bare `bun test`) already gates `build-image`/`promote` correctly via `needs:`.
- `frontend.yaml`: `build` job (unit tests via `bun run test`, then `bun run build`) gates `deploy-staging`/`deploy-production`. The `e2e` job runs on the same triggers but has no `needs` relationship to either deploy job — confirmed by reading the workflow file, not inferred.
- `bun test` with a stray `test.only()` exits `0` and silently runs only that test — reproduced locally (`onlytest/foo.test.ts` above). No `--forbid-only`-equivalent flag exists in `bun test --help`.
- `bun test --help` confirms `--coverage`, `--coverage-reporter=text|lcov`, and `--reporter=junit --reporter-outfile=<path>` all exist and are unused in any workflow today.
- `playwright.config.ts`'s `reporter: [['html', { open: 'never' }], ['list']]` has no `'github'` entry.

## Goals / Non-Goals

**Goals:**
- Close the e2e-does-not-gate-deploy gap ((f) in the finding list) — the one with actual production consequence.
- Give every app's CI the same two safety nets Playwright already partially has (`forbidOnly`) or could easily have (PR-diff annotations on failure), instead of frontend e2e being the only well-instrumented suite.
- Keep this CI-only: no application code changes.

**Non-Goals:**
- Not setting a coverage *threshold* that fails the build below some percentage. Coverage across the repo is currently thin by the root `AGENTS.md`'s own admission; a threshold picked today would either be trivially low (no signal) or immediately red (blocking unrelated PRs on a pre-existing gap). This change makes coverage *visible* (printed in the job log, and as an artifact); a future change can decide on gating once the ramp-domain and pure-helper test changes land and coverage has a real baseline.
- Not addressing e2e's serial `workers: 1` / sharding ((e) in the finding list) — the suite is 3 tests across 2 files today; parallelizing or sharding it now has no measurable benefit and adds config to maintain. Revisit once `#50`-`#53` (fixture factories, page objects, more specs) have actually grown the suite.
- Not changing `RADIUS_M`/any application-level test content — this change only touches `.github/workflows/*.yaml` and `playwright.config.ts`.

## Decisions

**`deploy-staging` gets `needs: [build, e2e]` (not touching `deploy-production` directly).** `deploy-production` already has `needs: deploy-staging`; GitHub Actions only starts a job once every direct dependency has succeeded, so making `deploy-staging` depend on `e2e` transitively blocks `deploy-production` too, without a second edit. Alternative considered: gate `deploy-production` on `e2e` directly instead/also — rejected as redundant given the transitive chain, and it would let `deploy-staging` (a real, if lower-stakes, deploy) go out on a red e2e suite while only production waited, which defeats the point.

**Playwright browser cache is keyed on the Playwright version, not `bun.lock`'s hash.** The installed browser binary is pinned by `@playwright/test`'s version, not by any other dependency in the lockfile; keying on `bun.lock`'s hash (like the existing `~/.bun/install/cache` cache) would invalidate on unrelated dependency bumps and reinstall the browser needlessly. `hashFiles('frontend/bun.lock')` still works as the key input in practice (the browser cache only needs to invalidate when Playwright's own version changes, and that change necessarily touches `bun.lock`), so no new cache-key mechanism is needed — same file, understood as "the thing whose hash changes when Playwright's version changes," not as "the thing that determines browser compatibility."

**`.only()`/`.skip()` guard is Biome's `suspicious/noFocusedTests`/`noSkippedTests` rules, set to `"error"` in each app's `biome.json`, not a CI grep step.** No native `bun:test` flag exists (confirmed above), but Biome (pinned at 2.4.9 in all three apps, rules available since 1.6.0) already ships both rules; they default to `"warn"` and only auto-enable via dependency detection for jest/mocha/ava/vitest, none of which this repo uses, so they need to be turned on explicitly rather than relying on the default. Verified locally against all three apps: a scratch `test.only(...)`/`test.skip(...)` file is caught by the existing `bunx biome check .` step already present in every `check`/`build` job, so no new CI step is needed at all. This replaces the original decision (a `grep -rn --include='*.test.ts' -E '\.(only|skip)\(' <test-dir>` CI step) — the grep approach worked but duplicated logic Biome already had a native rule for once actually checked (initially deferred as "may or may not exist depending on the version pinned," which turned out to be a wrong guess: it does exist at the pinned version). Belt-and-suspenders coverage bonus: Biome's rule also flags `describe.only`/`.skip` and other framework call shapes a `.test.ts`-scoped grep would miss.

**JUnit reporting is additive, not a replacement for the default console output.** `bun test --reporter=junit --reporter-outfile=junit.xml` writes structured output *in addition to* letting the normal pass/fail summary print to the job log (both can coexist), then a standard JUnit-consuming GitHub Action reads `junit.xml` and posts PR annotations. Coverage (`--coverage --coverage-reporter=text`) is a separate flag on the same `bun test` invocation, prints inline in the job log — no separate step needed.

**Trace-in-artifact verification happens before deciding whether a fix is even needed.** This is listed as a task ("verify, fix only if broken"), not assumed broken — Playwright's HTML reporter is documented to embed trace/attachment references relative to the report directory when both are generated by the same run, which this setup already does; the task is to confirm that empirically against a deliberately-failing spec, not to add upload steps preemptively.

## Risks / Trade-offs

- [Gating `deploy-staging` on `e2e` means a flaky (not just broken) e2e test blocks every deploy, including unrelated hotfixes] → Mitigation: `playwright.config.ts` already has `retries: process.env.CI ? 2 : 0`, which absorbs most flake; if a spec proves persistently flaky post-landing, the fix is to stabilize or quarantine that spec, not to loosen the gate.
- [The `.only()`/`.skip()` grep step could false-positive on a legitimate string containing `.only(` in a comment or fixture] → Mitigation: scope the grep to `--include='*.test.ts'`/`*.spec.ts` test files only, and review the actual matches at rollout time; current suite is small enough to hand-verify zero false positives before merging this change.
- [Adding coverage/junit steps to three separate workflow files (backend, frontend, hw-sim) triples the chance of a copy-paste mistake between them] → Mitigation: the three `bun test` invocations already have near-identical structure (see backend.yaml/hw-sim.yaml's `check` jobs); apply the same flag string to all three and verify each independently in tasks.

## Migration Plan

Plain revert for the workflow/config files themselves — no data, no feature flag, no deployed application code. The one thing that is *not* a plain revert in effect: once `deploy-staging` depends on `e2e`, merging this change means the very next push to `main` is gated by whatever the e2e suite's current state is. Since the suite is presumed green today (nothing in this exploration found a failing spec), land this on a normal PR and confirm the `e2e` job is green on that PR before merging — if it is not, fix or quarantine the failing spec first rather than merging a change that immediately blocks the next deploy.

## Open Questions

(none — coverage-threshold and e2e-sharding are explicitly deferred as Non-Goals above, not left as unresolved unknowns within this change's scope.)
