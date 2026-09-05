## Why

Rate limiting (`waf-abuse-containment`) stops volume; it does not stop a single request that never crosses the threshold but is still obviously automated (a bare `curl`, a basic headless client). `security-policy-framework`'s delegation test names exactly this as Cloudflare's structural advantage: bot/fingerprint signal aggregated across its whole network, which a single-tenant system cannot replicate. This raises the cost of casual scripted abuse against `/ramp/*` for the same Sept 10 window, without adding a step to the rider flow (rejected earlier as a design option: a visible "I'm not a robot" checkbox breaks the one-tap accessibility requirement the whole no-login design exists to protect).

## What Changes

- Enable Cloudflare bot management (Bot Fight Mode or Super Bot Fight Mode, whichever the account's plan tier supports) at the zone level.
- Configure a stricter action (block or non-interactive challenge) for low bot-score traffic scoped to `POST /ramp/reserve` and `DELETE /ramp/reserve/:id`.
- Leave read-only map traffic (`/stops`, `/routes*`, `/realtime/vehicles`, all SSE routes) unaffected by the stricter rule — legitimate map panning/zooming produces rapid, regular request patterns that can resemble automation, and should not be penalized by a rule aimed at write-route abuse.
- No interactive (human-solvable) challenge anywhere on `/ramp/*` — explicitly ruled out per the accessibility constraint.

## Capabilities

### New Capabilities

- `bot-mitigation`: observable contract for bot-classification-based traffic shaping — which traffic gets challenged or blocked as likely automated, which routes are exempt, and that no route requires an interactive human action to pass.

### Modified Capabilities

_None._

## Impact

- Cloudflare zone-level bot management setting (dashboard, and `fleet/tofu` if a Terraform resource exists for the account's plan tier — to be confirmed, see design.md).
- `fleet` wiki Operations page: document the configuration.
- `rampme-software.wiki` `Threat-Model.md`: add bot mitigation alongside the WAF rate limit in "Current containment".
- No changes to `backend/` or `frontend/` source.
