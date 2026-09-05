## Why

`fleet` issue #1 already names this the most important near-term security gap: the Cloudflare WAF fronting `api.rampme.site` has effectively no custom rules today, so the only live containment against a scripted attacker is a session cap the client fully controls (freely rotatable, see `security-policy-framework`). The ramp reservation endpoints are unauthenticated by design (accessibility) and trivially discoverable via browser devtools. The Robotics Forum Sofia presentation on 2026-09-10 puts the live, public API in front of a room of technically capable people; closing this gap before then is the highest-leverage single change available.

## What Changes

- Add Cloudflare rate limiting rules, keyed by IP, on `POST /ramp/reserve` and `DELETE /ramp/reserve/:id`, tuned with headroom above normal single-rider usage but tight enough to stop a scripted loop.
- Exclude SSE endpoints (`/ramp/session/stream`, `/realtime/vehicles/stream`, `/realtime/vehicles/:id/trip/etas`) from the rule explicitly, so reconnect-with-backoff behavior is never mistaken for abuse.
- On threshold breach, return a non-interactive rejection (429-equivalent), not a browser-interactive challenge — the calling code is a same-origin `fetch`, not a page navigation, and cannot render or solve an interactive challenge.
- Apply the same rule to `api-stage.rampme.site` (same public exposure, same availability stake, even though stage's `hw-sim` backend has no physical actuator).
- No change to GET route posture (`/stops`, `/routes*`, `/realtime/vehicles`) — out of scope here; automated-traffic shaping for those is `cloudflare-bot-mitigation`'s concern, not a rate limit.

## Capabilities

### New Capabilities

- `ramp/abuse-containment`: observable contract for edge-level rate limiting on ramp reservation write routes — what volume passes through, what gets rejected before reaching the backend, and which routes are exempt.

### Modified Capabilities

_None._

## Impact

- `fleet/tofu/*.tf`: new `cloudflare_ruleset` resource(s) (currently none exist for the zone).
- `fleet` wiki Operations page: document the rule, thresholds, and rollback.
- `rampme-software.wiki` `Threat-Model.md`: mark the WAF rule as implemented in "Current containment" (currently states "effectively no custom rules").
- `fleet` issue #1: acceptance criteria closed out to match what ships.
- No changes to `backend/` or `frontend/` source.
