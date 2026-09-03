## Context

See proposal.md - Why. All three app workflows (`backend.yaml`, `frontend.yaml`, `hw-sim.yaml`) run on `ubuntu-latest` with a `working-directory` default per app, and differ only in small ways: `timeout-minutes` (5 for backend/hw-sim's check, 10 for frontend's build), and frontend's `e2e` job needing only the setup half (no biome/tsc/bun test/junit steps - it runs Playwright instead).

## Goals / Non-Goals

**Goals:**
- One definition each for "set up a Bun app checkout" and "run biome + tsc + bun test with coverage/JUnit reporting", parameterized by working directory and app name.
- Every existing workflow step (order, flags, cache key shape, JUnit report `check_name`) stays byte-identical after the extraction - this is a refactor of where the steps live, not what they do.

**Non-Goals:**
- Not merging `backend.yaml`/`frontend.yaml`/`hw-sim.yaml` into one workflow file.
- Not converting to reusable `workflow_call` workflows (job-level reuse). Already considered and rejected in the prior CI-enforcement work: per-job config differs enough (`timeout-minutes`, working directory, and frontend's extra `e2e`/`deploy-*` jobs with no backend/hw-sim equivalent) that job-level reuse buys less than it costs in indirection. Composite actions give step-level reuse without forcing the job graphs to match.

## Decisions

- **Two composite actions, not one.** `setup-bun` (checkout + `oven-sh/setup-bun` + `bun install` cache + `bun install --frozen-lockfile`) is reused by every app's check/build job *and* frontend's `e2e` job. `bun-check-and-test` (`biome check` + `tsc --noEmit` + `bun test --coverage --reporter=junit` + `mikepenz/action-junit-report`) is reused only where the full check+test sequence runs (not `e2e`, which runs Playwright instead of `bun test`). Splitting them lets `e2e` opt into just the setup half instead of getting biome/tsc/bun-test steps it doesn't want.
- **Inputs, not hardcoded paths.** Each composite action takes `working-directory` and (for `bun-check-and-test`) a `check-name` input (`"Backend tests"` / `"Frontend tests"` / `"hw-sim tests"`), so the same action file produces the same JUnit report naming already in use today.
- **Location: `.github/actions/setup-bun/action.yaml` and `.github/actions/bun-check-and-test/action.yaml`.** Matches GitHub's own convention for repo-local composite actions and keeps them discoverable next to the workflows that call them.

## Risks / Trade-offs

- [A composite action's steps run in the calling job's context, so a mistake in the action affects all three apps at once instead of one] → mitigate by converting one workflow at a time and confirming a green CI run before moving to the next, per the Migration Plan below.
- [Extra indirection: reading `backend.yaml` no longer shows every step inline] → each composite action is narrowly scoped and named for exactly what it does, and this is the same trade-off already accepted for `docker/build-push-action`, `mikepenz/action-junit-report`, etc. elsewhere in these same files.

## Migration Plan

Plain revert if needed - this only touches `.github/` files, no deployed artifact, no data, no environment variables. Roll out incrementally: add both composite actions, switch `backend.yaml` to use them and confirm a green run, then `hw-sim.yaml`, then `frontend.yaml` (including its `e2e` job's setup half). Each step is an independent, revertible commit.
