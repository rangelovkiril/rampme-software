## Context

See `proposal.md` for motivation and `security-policy-framework`'s design for the delegation test and named adversary profile (opportunistic griefer / curious engineer) this change is sized against. `waf-abuse-containment` covers volumetric abuse via per-IP rate limiting; this change addresses a single, obviously-automated request that never reaches that threshold.

## Goals / Non-Goals

**Goals:**
- Raise the cost of naive scripted abuse (bare `curl`, unmodified headless browser) against `/ramp/reserve` and `/ramp/reserve/:id`, without adding latency, a new dependency, or a step to the legitimate rider path.
- Complement, not duplicate, the rate limit from `waf-abuse-containment` — this targets automation signature, not volume.

**Non-Goals:**
- Not defeating a sophisticated attacker running stealth-patched browser automation or paying for a CAPTCHA-solving service. Accepted residual risk under the named adversary profile (`security-policy-framework`) — that adversary is out of scope for this system's stakes.
- Not achieving per-route scoping. Super Bot Fight Mode (Pro plan) would allow skipping `/ramp/*` while keeping bot scoring on everything else; this project runs on the Free plan and isn't purchasing Pro for this. Tracked as a deferred backlog item (fleet, see Decisions).
- Not covering the MQTT/hardware channel — bot management operates on HTTP traffic at Cloudflare's edge and has zero visibility into the MQTT broker, an entirely separate channel (see `security-policy-framework`'s second trust boundary).

## Decisions

**Bot Fight Mode, zone-wide, accepting the challenge-on-API-traffic risk instead of avoiding it.** The Free plan's Bot Fight Mode "cannot be customized, adjusted, or reconfigured via WAF custom rules" (Cloudflare's own docs) — it runs outside the Ruleset Engine entirely, so there is no skip rule, no custom rule, no per-path exemption available at this tier, unlike Super Bot Fight Mode. Its action for traffic it scores as automated is a "computationally expensive challenge," which Cloudflare's own docs warn "may challenge API or mobile app traffic" — exactly the failure mode the interactive-challenge/checkbox option was rejected for earlier (a `fetch()` call can't solve it). Enabling this zone-wide therefore risks the exact thing this project has spent the most design effort avoiding: an unsolvable challenge landing on `/ramp/reserve`. Alternative considered: don't enable Bot Fight Mode at all, given this risk. Rejected — the maintainer decided the residual risk is acceptable given (a) Bot Fight Mode's heuristics target obviously-non-browser traffic (bare `curl`, headless scrapers without JS execution), not a same-origin `fetch()` call from an already-rendered page in a real browser, which is about as strong a "not a bot" signal as exists, and (b) rollback is a single toggle, not a multi-step process, so a live problem is fast to undo.

**Live verification immediately after enabling, not a scheduled follow-up.** Because the zone-wide risk above is real and this zone has no staging equivalent (production and stage share one Cloudflare zone, `rampme.site` — enabling this affects both hostnames and the Pages site simultaneously, there is no isolated test surface), the reservation create/cancel flow gets tested against the live deployed frontend immediately after `fight_mode` is enabled, before treating this change as done, not deferred as a follow-up task.

**Super Bot Fight Mode deferred as its own backlog item, not folded into this change.** Per-route scoping is a real capability gap this change accepts rather than closes. Recorded as fleet#17, explicitly deferred alongside the other backlog this review has produced (rampme-software#83, #84, fleet#10) — same treatment, same reason: real gap, not free to close (Pro plan isn't purchased for this), not blocking what can ship now.

## Risks / Trade-offs

[Bot Fight Mode challenges a legitimate `/ramp/reserve` `fetch()` call, silently breaking a rider's reservation attempt] → Mitigation: immediate live verification after enabling (see Decisions); one-toggle rollback (`fight_mode = false`) if it happens; accepted as a real risk, not designed away, because this plan tier has no scoping mechanism to design it away with.

[Bot scoring false-positives an atypical but legitimate client — e.g., an assistive-technology browser with an unusual fingerprint] → Mitigation: monitor for a concentrated spike from one user-agent/fingerprint signature after launch; ties to rampme-software#43 (frontend accessibility audit) as a related concern worth cross-checking once real traffic exists.

[Bot scoring criteria are a Cloudflare implementation detail not documented in this repo] → Accepted; this is inherent to delegating the decision per the framework's delegation test (Cloudflare's opacity here is the same trade already made for the WAF generally, not a new one).

## Migration Plan

Plain revert. Bot management is a zone-level toggle plus a scoped rule; disabling it or reverting the `tofu` resource (if one exists for this plan tier) removes the behavior immediately, with no data model and no feature flag involved.
