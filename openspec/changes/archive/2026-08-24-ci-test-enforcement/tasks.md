## 1. Backend

- [x] 1.1 Add `--coverage --coverage-reporter=text --reporter=junit --reporter-outfile=junit.xml` to `backend.yaml`'s `check` job's `bun test` step; add a step consuming `junit.xml` to post GitHub PR annotations on failure. Verify by deliberately breaking a backend test on a scratch branch/PR and confirming both the coverage summary appears in the job log and the failure is annotated on the PR diff, then revert the scratch break.
  - Used `mikepenz/action-junit-report@v6` (job gains `checks: write`); coverage table and junit.xml both confirmed locally (`bun test --coverage --coverage-reporter=text --reporter=junit --reporter-outfile=junit.xml`). PR-diff annotation itself can only be confirmed on an actual PR — see task 5.1/12.
- [x] 1.2 ~~Add a step to `backend.yaml`'s `check` job that runs `grep -rn --include='*.test.ts' -E '\.(only|skip)\(' backend/test` and fails if it matches.~~ Superseded: set `suspicious.noFocusedTests`/`suspicious.noSkippedTests` to `"error"` in `backend/biome.json` instead (see design.md's revised Decision) — no new CI step, the existing `bunx biome check .` step already in `check` catches it. Verify the same way: add a temporary `test.only(...)`/`test.skip(...)` locally, confirm `bunx biome check .` fails, then remove it.
  - Verified locally: scratch `test.only(...)` and `test.skip(...)` files each tripped `lint/suspicious/noFocusedTests`/`noSkippedTests` and made `bunx biome check .` exit 1; removed after confirming. Existing test suite stays Biome-clean.

## 2. Frontend

- [x] 2.1 Add `--coverage --coverage-reporter=text --reporter=junit --reporter-outfile=junit.xml` to `frontend.yaml`'s `build` job's `bun run test` step (or a dedicated step calling `bunx bun test test --coverage ...` if the `test` script itself shouldn't carry CI-only flags); add the same PR-annotation step as backend. Verify the same way as 1.1.
  - Went with the dedicated-step option: `package.json`'s `test` script stays `bun test test` (used locally too), CI calls `bun test test --coverage ... --reporter-outfile=junit.xml` directly instead of `bun run test`. Verified locally the same way as 1.1.
- [x] 2.2 ~~Add a step to `frontend.yaml`'s `build` job that runs `grep -rn --include='*.test.ts' -E '\.(only|skip)\(' frontend/test` and fails if it matches.~~ Superseded: same as 1.2 — `suspicious.noFocusedTests`/`suspicious.noSkippedTests` set to `"error"` in `frontend/biome.json`, caught by the existing `bunx biome check .` step. Verify the same way as 1.2.
  - Verified locally the same way as 1.2.
- [x] 2.3 Add a cache step to `frontend.yaml`'s `e2e` job for Playwright's browser binaries, keyed on `hashFiles('frontend/bun.lock')` (see design.md's Decisions), before the `bunx playwright install --with-deps chromium` step, so a cache hit skips the download. Verify by running the workflow twice and confirming the second run's install step reports a cache hit / shorter duration.
  - Cache path `~/.cache/ms-playwright` (Playwright's default binary cache dir on Linux runners). The "second run reports a cache hit" half of verification only observable on actual `push`/`pull_request` runs of this workflow (see task 5.1/12).
- [x] 2.4 Add `'github'` to `playwright.config.ts`'s `reporter` array. Verify by deliberately breaking an e2e spec on a scratch branch/PR, confirming the failure is annotated inline on the PR diff, then reverting the break.
  - Ran locally with the `'github'` reporter active (both passing and deliberately-failing specs); it emits `::notice`/`::error` workflow commands harmlessly outside CI, so no `process.env.CI` guard needed. PR-diff annotation itself needs an actual PR run — see task 5.1/12.
- [x] 2.5 Verify whether `trace: 'retain-on-failure'` traces are already reachable from the uploaded `playwright-report/` artifact (deliberately fail a spec, download the artifact, confirm the trace viewer opens from within it). If they are not, add the missing upload step or reporter option; if they already are, no change needed — record which case it was.
  - **Already reachable — no change needed.** Deliberately broke `e2e/transit.spec.ts` locally and ran `playwright test`: the HTML reporter's `playwright-report/` directory is self-contained — it embeds the failing test's `trace.zip` under `playwright-report/data/` and ships its own standalone trace viewer under `playwright-report/trace/` (separate from the raw `test-results/<test>/trace.zip` files, which are not what gets uploaded). Since `frontend.yaml` already uploads `frontend/playwright-report/` as the `playwright-report` artifact, downloading it and opening `index.html` reaches the trace without needing `test-results/`.
- [x] 2.6 Add `e2e` to `deploy-staging`'s `needs` list in `frontend.yaml` (alongside `build`). Verify by confirming the workflow graph shows `deploy-staging` waiting on both jobs, and that `deploy-production`'s existing `needs: deploy-staging` therefore blocks transitively — per design.md's Migration Plan, confirm the `e2e` job is green on this change's own PR before merging.
  - `needs: [build, e2e]`; `deploy-production`'s `needs: deploy-staging` is unchanged so the block is transitive. Green-e2e-before-merge confirmation happens at task 5.1/12 on this change's own PR.

## 3. hw-sim

- [x] 3.1 Add `--coverage --coverage-reporter=text --reporter=junit --reporter-outfile=junit.xml` to `hw-sim.yaml`'s `check` job's `bun test` step, plus the same PR-annotation step as backend/frontend. Verify the same way as 1.1.
- [x] 3.2 ~~Add a step to `hw-sim.yaml`'s `check` job that runs `grep -rn --include='*.test.ts' -E '\.(only|skip)\(' hw-sim/test` and fails if it matches.~~ Superseded: same as 1.2 — `suspicious.noFocusedTests`/`suspicious.noSkippedTests` set to `"error"` in `hw-sim/biome.json`, caught by the existing `bunx biome check .` step. Verify the same way as 1.2.
  - Verified locally the same way as 1.2.

## 4. Wiki

- [x] 4.1 Update the software wiki's CI/CD page to describe: `deploy-staging` now gates on `e2e` (not just `build`), and backend/frontend/hw-sim CI now report coverage + PR-level failure annotations via JUnit (backend/hw-sim/frontend-unit) and the `github` Playwright reporter (frontend e2e).

## 5. Verify

- [ ] 5.1 Confirm all three `check`/`build` workflows and the `e2e` workflow pass end to end on this change's own PR (not just individually) before merge, per design.md's Migration Plan.
