## Why

`backend.yaml`, `frontend.yaml`, and `hw-sim.yaml` each repeat a near-identical `checkout → setup-bun → cache → install → biome check → tsc --noEmit → bun test --coverage --reporter=junit → mikepenz/action-junit-report` block in their `check`/`build` job, and `frontend.yaml`'s `e2e` job repeats the `checkout → setup-bun → cache → install` half a fourth time. This was already identified during the `ci-test-enforcement` change (2026-08-24) and deliberately deferred until that change's own diff landed, to avoid editing the same lines twice. It has landed (PR #68); this is that deferred follow-up.

## What Changes

- Extract the repeated setup steps (`checkout` + `setup-bun` + `bun install` cache) into a composite action.
- Extract the repeated check+test steps (`biome check` + `tsc --noEmit` + `bun test --coverage --reporter=junit` + JUnit report publish) into a second composite action, parameterized for the small differences between apps (working directory, `timeout-minutes`).
- Update `backend.yaml`, `frontend.yaml`, and `hw-sim.yaml` to call the composite actions instead of inlining the steps.
- No change to what each workflow triggers on, what it builds/pushes, or its job dependency graph (`check → build-image → promote`, `build`/`e2e → deploy-staging → deploy-production`) — this only de-duplicates step definitions.

## Capabilities

No spec-level behavior changes — this is CI tooling de-duplication with no product-observable effect. `skip_specs: true` is set in this change's `.openspec.yaml`.

## Impact

- `.github/workflows/backend.yaml`, `.github/workflows/frontend.yaml`, `.github/workflows/hw-sim.yaml` — steps replaced with composite action calls.
- New: `.github/actions/setup-bun/action.yaml`, `.github/actions/bun-check-and-test/action.yaml` (or equivalent naming decided in design.md).
- No environment variables, deployment targets, or CORS origins are affected; this does not touch the `fleet` repo or the wiki's CI/CD runbook page beyond noting the composite actions exist, if that page describes individual workflow steps.
