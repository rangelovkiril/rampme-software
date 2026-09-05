## Context

See `proposal.md` for motivation and `security-policy-framework`'s design for the delegation test and named adversary profile (opportunistic griefer / curious engineer) this change is sized against. `waf-abuse-containment` covers volumetric abuse via per-IP rate limiting; this change addresses a single, obviously-automated request that never reaches that threshold.

## Goals / Non-Goals

**Goals:**
- Raise the cost of naive scripted abuse (bare `curl`, unmodified headless browser) against `/ramp/reserve` and `/ramp/reserve/:id`, without adding latency, a new dependency, or a step to the legitimate rider path.
- Complement, not duplicate, the rate limit from `waf-abuse-containment` — this targets automation signature, not volume.

**Non-Goals:**
- Not defeating a sophisticated attacker running stealth-patched browser automation or paying for a CAPTCHA-solving service. Accepted residual risk under the named adversary profile (`security-policy-framework`) — that adversary is out of scope for this system's stakes.
- Not adding any interactive, human-solvable challenge to `/ramp/*`. Rejected explicitly in prior discussion: a visible checkbox is an extra tap that costs the exact population (elderly, motor-impaired riders) the no-login design exists to protect, for a defensive gain already covered by non-interactive scoring.
- Not covering the MQTT/hardware channel — bot management operates on HTTP traffic at Cloudflare's edge and has zero visibility into the MQTT broker, an entirely separate channel (see `security-policy-framework`'s second trust boundary).

## Decisions

**Non-interactive bot score only, never a visible challenge, on `/ramp/*`.** Consistent with the accessibility constraint stated above. Alternative considered: Managed Challenge (interactive) as the action for low-scoring traffic. Rejected — same reasoning as `waf-abuse-containment`'s action choice: a `fetch` call from the SPA cannot render or solve an interactive challenge, so this would either silently fail for a legitimate caller with an unlucky fingerprint, or Cloudflare would fall back to blocking anyway, making the "challenge" pointless overhead.

**Stricter action scoped to write routes only, not the whole zone.** Read-only map endpoints see high-frequency, mechanically regular request patterns during normal use (viewport-bounded polling as a user pans/zooms) that a zone-wide bot rule could plausibly score as automated. Scoping the stricter action to `/ramp/reserve` and `/ramp/reserve/:id` avoids that false-positive surface entirely rather than tuning around it. Alternative considered: apply the same action zone-wide for simplicity. Rejected — the map's own normal usage pattern is the counterexample that breaks it.

**Plan-tier feature availability verified at task time, not assumed here.** Whether the account's Cloudflare plan supports per-route bot rules (versus zone-wide only) determines whether this ships as configured above or falls back to a zone-wide rule with a looser action. Not resolved as a design choice because it's a fact to check (the current plan tier), not a trade-off to weigh — a task below verifies it before the ruleset is written.

## Risks / Trade-offs

[Bot scoring false-positives an atypical but legitimate client — e.g., an assistive-technology browser with an unusual fingerprint] → Mitigation: monitor block/challenge logs after launch for a concentrated spike from one user-agent/fingerprint signature; ties to rampme-software#43 (frontend accessibility audit) as a related concern worth cross-checking once real traffic exists.

[The plan tier doesn't support per-route bot rules, only zone-wide] → Mitigation: task 1 verifies this against the live dashboard before configuration; if only zone-wide is available, fall back to it with a looser action tuned to avoid the map-panning false-positive case, and note the narrower goal wasn't achievable at this plan tier.

[Bot scoring criteria are a Cloudflare implementation detail not documented in this repo] → Accepted; this is inherent to delegating the decision per the framework's delegation test (Cloudflare's opacity here is the same trade already made for the WAF generally, not a new one).

## Migration Plan

Plain revert. Bot management is a zone-level toggle plus a scoped rule; disabling it or reverting the `tofu` resource (if one exists for this plan tier) removes the behavior immediately, with no data model and no feature flag involved.
