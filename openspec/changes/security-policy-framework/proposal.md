## Why

`rampme-software`'s GitHub private vulnerability reporting is already enabled at the repo level, but there is no `SECURITY.md` to surface it, and the [Threat Model](https://github.com/rangelovkiril/rampme-software/wiki/Threat-Model) wiki page, while a solid start, has gaps a deliberate review surfaced: it credits the two-reservation session cap with abuse-containment value it cannot have (session ids are freely client-generated), it never mentions the per-vehicle single-flight deploy guard that already exists in code, and its trust boundary is stated only in terms of the Cloudflare edge, silently ignoring the MQTT/physical-hardware path as a second boundary. Two follow-on proposals (WAF rate limiting, Cloudflare bot mitigation) need a settled, reusable justification for what gets delegated to Cloudflare and what stays in application logic; without formalizing that reasoning here, each proposal would have to re-argue it from scratch. The Robotics Forum Sofia presentation on 2026-09-10 adds a concrete date by which the public-facing posture should be accurate and defensible.

## What Changes

- Add a root `SECURITY.md`: reporting channel (pointing at the already-enabled private vulnerability reporting), scope (backend, frontend, `hw-sim` as a test double — not production hardware firmware, which lives in `rampme-hardware`), and a project-specific severity scale.
- Update the wiki's `Threat-Model.md` (and its `-BG` counterpart):
  - Reframe the two-reservation session cap as a UX safety net (protects against an accidental double-submit), not a containment layer.
  - Document the existing per-vehicle single-flight deploy guard (`isDeployInFlight` in `backend/src/services/ramp/bridge.ts`) as current containment — it exists today and isn't mentioned.
  - Name "fleet-wide spray" and "mechanical wear via route pre-staging" explicitly as risks under "what is actually at risk", not just implied by the general griefing framing.
  - Add a formal delegation test: which containment layer (Cloudflare edge vs. backend logic) a given control belongs to, and why.
  - Name the adversary profile explicitly (opportunistic griefer / curious engineer, not an organized or well-resourced attacker) as the yardstick every containment decision is measured against.
  - Add a second, explicit trust boundary for the MQTT/physical hardware path, distinct from the Cloudflare edge boundary.
  - Add a "known gaps, deliberately deferred" list linking the backlog issues this review produced (rampme-software#40, #41, #83, #84, fleet#10), each with one sentence on why it isn't being closed now.
- No application code changes.

## Capabilities

### New Capabilities

_None._ This change is documentation only; no observable system behavior changes. `.openspec.yaml` sets `skip_specs: true`.

### Modified Capabilities

_None._

## Impact

- New file: `SECURITY.md` (repo root).
- `rampme-software.wiki` (separate git repo): `Threat-Model.md`, `Threat-Model-BG.md`.
- No changes to `backend/`, `frontend/`, or `hw-sim/` source.
- Downstream: `waf-abuse-containment` and `cloudflare-bot-mitigation` (both proposed separately) reference the delegation test and adversary profile established here rather than re-deriving them.
