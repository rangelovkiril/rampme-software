## Context

See proposal.md - Why. `frontend/` and `backend/` are independently deployed apps with no root-level workspace (`package.json` does not exist at the repo root), so there is no existing mechanism to import a TypeScript type from one into the other. `hw-sim/src/protocol.ts` already faced the same shape of problem for its MQTT contract with `backend/src/services/ramp/bridge.ts` and deliberately chose manual, documented duplication over introducing shared-package tooling, given the contract is small and stable.

## Goals / Non-Goals

**Goals:**
- Make the `POST /ramp/reserve` request shape's single source of truth locatable from all three places that currently hand-write or hand-assert it (`RampContext.tsx`, `routes/ramp.ts`'s TypeBox schema, `frontend/e2e/fixtures/transit.ts`'s mock assertion).
- Keep the mechanism proportionate to the actual risk: this is a small, rarely-changed request shape (three fields), not a large or frequently-evolving API surface.

**Non-Goals:**
- Not introducing a Bun/npm workspace linking `frontend/` and `backend/` - rejected for the same reason `hw-sim`'s equivalent problem was: it would add build/tooling surface (and touch each app's `bun build`/Docker setup) disproportionate to a three-field, rarely-changed request body.
- Not adding runtime schema validation on the frontend side (e.g. shipping TypeBox or a JSON Schema validator to the browser bundle) - backend's existing TypeBox validation already rejects a malformed request with 400, which is the self-diagnosing behavior that keeps this risk low to begin with (see proposal.md's framing of this as lower-priority than the other three changes in this batch).

## Decisions

- **Documentation-only cross-reference, not shared code.** Add a one-line comment at each of the three sites (`RampContext.tsx`'s `fetch` call, `routes/ramp.ts`'s `t.Object({...})` schema, `transit.ts`'s mock body) naming the other two by path, so editing one prompts a look at the others. This matches the cost/benefit already accepted for `hw-sim/src/protocol.ts` and needs no new tooling, dependency, or build step.
- **Considered and rejected: a shared JSON fixture file** (e.g. `reserve-request.fixture.json`) imported by both the backend TypeBox schema (as a validation example) and the e2e mock. Rejected because backend and frontend still cannot literally `import` a file across the app boundary without a workspace, so this would still require either duplicating the fixture file itself in both trees (no better than the current comment-only approach) or introducing the same workspace machinery this design explicitly avoids.

## Risks / Trade-offs

- [A comment-only cross-reference relies on a human noticing and following it - it does not mechanically prevent drift] → accepted; the actual failure mode (a shape mismatch) is already caught quickly in practice by backend's TypeBox 400 response the first time anyone exercises the real endpoint (manually, via stage, or once `ramp-reserve-without-mqtt` and any future backend integration test run), which is why this change is documentation-weight rather than tooling-weight.

## Migration Plan

Plain revert - comment-only change in three files, no behavior, no environment variables, no deployment impact.
