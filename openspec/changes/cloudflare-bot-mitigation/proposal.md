## Why

Rate limiting (`waf-abuse-containment`) stops volume; it does not stop a single request that never crosses the threshold but is still obviously automated (a bare `curl`, a basic headless client). `security-policy-framework`'s delegation test names exactly this as Cloudflare's structural advantage: bot/fingerprint signal aggregated across its whole network, which a single-tenant system cannot replicate. This raises the cost of casual scripted abuse against `/ramp/*` for the same Sept 10 window, without adding a step to the rider flow (rejected earlier as a design option: a visible "I'm not a robot" checkbox breaks the one-tap accessibility requirement the whole no-login design exists to protect).

## What Changes

- Enable Cloudflare **Bot Fight Mode** (the Free-plan product; **Super Bot Fight Mode requires Pro**, not purchased for this project) at the zone level.
- Accept that this is zone-wide with no per-route scoping: Bot Fight Mode runs outside the Ruleset Engine and cannot be skipped or scoped via custom rules at this plan tier, unlike Super Bot Fight Mode. It therefore also covers `/ramp/reserve`/`/ramp/reserve/:id` and the read-only map routes identically — there is no way to leave map traffic unaffected while still protecting the write routes, as originally scoped.
- Accept the documented risk that Cloudflare's own docs state Bot Fight Mode "may challenge API or mobile app traffic" with a computationally-expensive challenge a `fetch()` call cannot solve — the same category of problem the interactive-challenge rejection (checkbox CAPTCHA) already ruled out, now an accepted risk instead of an avoided one, because there is no zone-wide-but-not-`/ramp/*` middle ground on this plan.
- Mitigate the residual risk operationally, not architecturally: verify the live reservation create/cancel flow immediately after enabling, with a one-toggle rollback (disabling `fight_mode`) ready if it interferes.
- Defer per-route scoping (Super Bot Fight Mode, Pro plan) as a tracked backlog item, not purchased now.

## Capabilities

### New Capabilities

- `bot-mitigation`: observable contract for bot-classification-based traffic shaping — which traffic gets challenged or blocked as likely automated, which routes are exempt, and that no route requires an interactive human action to pass.

### Modified Capabilities

_None._

## Impact

- `fleet/tofu`: new `cloudflare_bot_management` resource (`bot.tf`), `fight_mode = true`.
- `fleet` wiki Operations page: document the configuration and the zone-wide/no-scoping limitation.
- `rampme-software.wiki` `Threat-Model.md`: add bot mitigation alongside the WAF rate limit in "Current containment", including the accepted zone-wide risk.
- A new backlog issue tracking the Super Bot Fight Mode / Pro-plan upgrade as deferred, not purchased now.
- No changes to `backend/` or `frontend/` source.
