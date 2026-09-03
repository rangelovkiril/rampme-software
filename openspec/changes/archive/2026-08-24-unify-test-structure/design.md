## Context

See proposal.md - Why. Current layout, concretely:

| App | Layout | Evidence |
|---|---|---|
| backend | `test/` mirrors `src/` (`test/gtfs/`, `test/services/`, `test/services/ramp/`) | documented in `backend/AGENTS.md` |
| frontend (unit) | colocated (`lib/config.test.ts`, `lib/ramp-updates.test.ts`) | `frontend/AGENTS.md`, `frontend/package.json`'s `"test": "bun test lib"` |
| frontend (e2e) | flat `e2e/*.spec.ts` + `e2e/fixtures/`, own Playwright `testDir` | `frontend/playwright.config.ts` |
| hw-sim | single flat integration file, not decomposed per module | `hw-sim/AGENTS.md` |

The `bun test lib` scoping in `frontend/package.json` is itself evidence the colocated layout doesn't fall out naturally from the tool: `.spec.ts` (Playwright) vs `.test.ts` (bun:test) naming already separates the two runners, so the extra `lib` scope is either a leftover from when `config.test.ts` was the only file, or a guard against `bun:test` walking into other top-level dirs once they grow test files. A mirrored `test/` root removes the need for that scoping entirely — the directory boundary does the job.

## Goals / Non-Goals

**Goals:**
- One documented answer to "where does a new test file go" across backend, frontend, hw-sim.
- Write down the testability pattern the two local commits (`9c635a2`, `a22672f`) already used, so it's a deliberate choice on the next untested module (`proximity.ts` is the next candidate — see Decisions) rather than something re-derived or missed.

**Non-Goals:**
- Not restructuring `frontend/e2e/` (out of scope per proposal — different organizing axis, user flow not source module).
- Not deciding hw-sim's `test/` decomposition (open question below).
- Not writing any new test content (`proximity.ts`, `gtfs/time.ts`, etc.) — that's the separate backlog from #65, tracked outside this change.

## Decisions

**Mirror-tree everywhere a source tree exists to mirror.** Rejected keeping colocation for frontend: the two layouts' trade-offs (navigation cost vs. coverage-gap visibility, production-tree cleanliness vs. rename safety) roughly cancel out at frontend's current scale (2 unit test files), so the cost of documenting and remembering *why* they differ outweighs what either layout wins. Mirror also matches backend's already-larger, already-working precedent, so there's one convention to teach instead of two.

**The DI-factory / pure-function split is documented as a heuristic, not a lint rule.** Alternative considered: a stricter rule ("every stateful module must expose `createX()`"). Rejected — mechanically applying either extraction to code that doesn't need it (e.g. a module with no cross-call state, or a side effect too trivial to be worth a pure/effectful split) adds indirection for no testability gain. The guidance is descriptive of a pattern to reach for, not a gate: fluid, not rigid.

  Concrete shape, as demonstrated:
  - **State across calls (timers, in-flight tracking, connections) → DI via factory.** `createRampBridge(mqtt, timeoutMs)` returns an instance holding its own private state; production wires one singleton (`initRampBridge()`/`getRampBridge()`, mirroring the existing `getMqtt()`/`getGtfs()` pattern); a test calls the factory directly with a fake dependency and a short timeout.
  - **Pure computation mixed with a side effect → extract the computation.** `computeRampUpdate(prev, curr)` is a plain `(input) -> output` function with no React/IO; the effectful caller (`RampContext`'s `applyReservations`) becomes a thin pass-through that applies the result to state.
  - `services/ramp/proximity.ts` is the next module already in this exact pre-refactor shape (module-level `vehicleLastSeen` Map + `interval` handle, direct `getRampBridge()`/`getGtfs()`/`getAllActiveReservations()` calls inside `tick()`) — named here as a worked example for whoever picks up #65's proximity coverage, not as a task of this change.

**`frontend/e2e/` stays as its own top-level dir, not nested under `test/`.** It already isn't colocated with source, already has its own Playwright `testDir`, and mirrors user flows rather than source files — moving it under a source-mirroring `test/` tree would misrepresent what it mirrors.

## Risks / Trade-offs

- [Moving `frontend/lib/*.test.ts` breaks import-relative paths inside those test files] → Mitigation: paths are relative imports (`./ramp-updates`, `./config`), so imports must be updated to `../../lib/...` at move time; `bun run check` and `bun run test` after the move catch anything missed.
- [Convention decided today drifts as more contributors/agents touch the repo] → Mitigation: written into `frontend/AGENTS.md` and `backend/AGENTS.md` (source of truth for both humans and agents per root `AGENTS.md`), not just this change's archive.

## Migration Plan

Plain revert if needed — this is a file-move plus two doc edits plus one `package.json` script line, no data, no deployed surface, no feature flag. No staged rollout: apply in one PR, `bun run check` + `bun run test` in `frontend/` confirm the move didn't break anything before merge.

## Open Questions

- Should `hw-sim/test/hw-sim.test.ts` eventually decompose into per-module files under a mirrored `test/` tree (`test/broker.test.ts`, `test/simulator.test.ts`, ...), or stay a single deliberately-integration-style test (real ephemeral-port broker, exercising the wire protocol end to end)? Left open — hw-sim's test currently isn't mirroring anything because there's only one file; this doesn't block or contradict the mirror-tree decision above, it's a separate question of whether to split that one file.
