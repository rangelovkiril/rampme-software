## Why

Test layout currently diverges across the three apps for no documented reason: backend mirrors `src/` under `test/`, frontend colocates unit tests next to source under `lib/`, hw-sim has a single flat integration-style test file. Tracking *why* each app differs costs context — for contributors and for AI agents re-deriving it every session — for a difference that buys little. Separately, two recent local commits (`9c635a2`, `a22672f`) each turned an untestable module testable using the same underlying move (extract the untestable part via dependency injection or a pure function) without that move being written down anywhere, risking it being reinvented inconsistently or forgotten as more of the backlog in #65 gets worked.

## What Changes

- Standardize on the mirror-tree layout (`test/` mirroring the source tree) across all three apps. Backend already follows this; frontend's two existing unit test files (`lib/config.test.ts`, `lib/ramp-updates.test.ts`) move to `frontend/test/lib/`, and the `bun run test` script drops its `bun test lib` scoping hack in favor of the naturally-scoped `test/` root.
- `frontend/e2e/` is explicitly out of scope: it is already its own top-level directory with a separate Playwright `testDir`, organized by user flow rather than by source module, and applying source-mirroring to it would not make sense.
- hw-sim's single integration-style test file (`test/hw-sim.test.ts`) is left as-is for now; whether it should later decompose into per-module files under a mirrored tree is an open follow-up, not decided by this change.
- Document, as project-level guidance rather than a mechanical rule, the testability principle the two commits demonstrate: when logic resists testing because it owns state across calls (timers, in-flight tracking, connections), extract it via a `createX(dependency, config)` factory with production wiring a single instance (mirroring `getMqtt()`/`getGtfs()`); when logic instead mixes a pure computation with a side effect (`setState`, I/O, logging), extract the computation into a plain `f(input) -> output` function and leave the effectful caller as a thin pass-through. This is a heuristic to reach for judgment, not a checklist to apply to every function — fluid, not rigid.

## Capabilities

No spec-level behavior changes; this is test tooling/process only (`skip_specs: true`).

### New Capabilities
(none)

### Modified Capabilities
(none)

## Impact

- `frontend/lib/config.test.ts`, `frontend/lib/ramp-updates.test.ts` → move to `frontend/test/lib/`.
- `frontend/package.json`: `"test": "bun test lib"` → `"test": "bun test test"` (or equivalent scoped to the new `test/` root).
- `frontend/AGENTS.md`: testing section (currently `bun run test # bun:test, files under lib/ (currently just config.ts)`) updated to describe the mirrored `test/` layout, matching how `backend/AGENTS.md` already documents its own `test/` tree.
- `backend/AGENTS.md`: add the DI-factory / pure-function testability guidance to the Rules section (no structural change needed — already mirrors `src/`).
- `hw-sim/AGENTS.md`: no forced change; note the open question about `test/hw-sim.test.ts`'s future organization as a follow-up, not resolved here.
- No production code changes, no wiki updates (nothing here touches infrastructure, deployment, CORS, env vars, or the ramp MQTT protocol).
