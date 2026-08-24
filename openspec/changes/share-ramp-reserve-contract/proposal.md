## Why

`frontend/contexts/RampContext.tsx` hand-writes the `POST /ramp/reserve` request body (`{ vehicle_id, stop_id, type }`) independently of `backend/src/routes/ramp.ts`'s TypeBox schema for the same request — there is no shared source of truth between the two apps for this shape (confirmed: no root-level workspace/`package.json` exists to share a type across `frontend/` and `backend/`, the same situation `hw-sim/src/protocol.ts` already documents for its own duplicated-by-design MQTT contract with `backend/src/services/ramp/bridge.ts`). A silent shape drift between the two sides would not be caught by either app's own suite: `frontend/e2e`'s `mockTransitApi` asserts against its own hand-written expectation, and backend's tests only exercise backend's own schema.

## What Changes

- Establish one documented point of truth for the `POST /ramp/reserve` request shape, cross-referenced from both `RampContext.tsx` and `routes/ramp.ts` (and `frontend/e2e/fixtures/transit.ts`'s mock assertion), so a future shape change is far more likely to touch a visible, singular place instead of three independently-maintained copies.
- Given the cost/benefit precedent already set by `hw-sim/src/protocol.ts` (a small, stable contract was deliberately kept as manually-synced duplication rather than introducing shared-package tooling across independently-deployed apps), this change is expected to stay lightweight — documentation/comment cross-references and/or a small fixture reused by tests, not a new build-time shared package. The concrete mechanism is decided in design.md.
- No change to the actual request shape or any runtime behavior.

## Capabilities

No spec-level behavior changes — this only reduces the risk of an unnoticed future contract drift; the contract itself is unchanged. `skip_specs: true` is set in this change's `.openspec.yaml`.

## Impact

- `frontend/contexts/RampContext.tsx` — the hand-written request body.
- `backend/src/routes/ramp.ts` — the TypeBox schema for the same request.
- `frontend/e2e/fixtures/transit.ts` — the mock's expected request shape.
- No environment variables, deployment, or CORS changes.
