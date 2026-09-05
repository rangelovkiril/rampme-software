## Context

See `proposal.md` for motivation and `security-policy-framework`'s design for the delegation test this change applies (edge-appropriate: cheap-to-recover-from, and Cloudflare sees more than a single-tenant rate counter could show a homegrown solution). `fleet/tofu` already manages the zone's DNS, tunnel, and Pages project as code (`dns.tf`, `tunnel.tf`, `pages.tf`); no `cloudflare_ruleset` resource exists yet for this zone (`fleet/tofu/README.md` names this explicitly as tracked-but-not-started work).

## Goals / Non-Goals

**Goals:**
- Stop a single scripted actor (one IP, one script) from creating or cancelling ramp reservations at abusive volume, before Sept 10.
- Keep SSE streams (vehicle positions, per-trip ETAs, ramp session updates) completely unaffected.
- Return a response the frontend's existing error handling can treat like any other failed `fetch`, not a challenge flow that assumes a page render.

**Non-Goals:**
- Not defending against a distributed attack (many different IPs, each individually under the threshold, targeting many vehicles at once). Per-IP counting cannot see that pattern by construction; closing it would need a backend-side global ceiling, which is not scoped here (noted as a residual risk below, not folded into an existing backlog issue since it wasn't raised as one during review — flagging for a decision on whether it deserves its own issue).
- Not covering GET route traffic shaping (bot-classification-based, not rate-based) — that's `cloudflare-bot-mitigation`.
- Not implementing the backend-side rate limit or IP-scoped standing cap from rampme-software#41 — this proposal is edge-only.

## Decisions

**Key by IP, never by `X-Session-Id`.** The session id is client-generated (`crypto.randomUUID()`, no server issuance or signature) and free to rotate per request. Keying a WAF rule on it would let an attacker mint a fresh session id per request and never trip the limit — the opposite of the point. Alternative considered: key by the session header. Rejected outright; it doesn't survive contact with the actual client code.

**One combined rule, not one per route.** This account's plan tier allows exactly one rule in the `http_ratelimit` phase entry-point ruleset (confirmed the hard way: API error code 50001, "exceeded the maximum number of rules in the phase http_ratelimit: 2 out of 1" — not documented anywhere checkable beforehand). `POST /ramp/reserve` and `DELETE /ramp/reserve/:id` share one rule and one counter: 20 requests/minute per IP **combined** across create and cancel, not 20/minute each. Rationale for the number itself is unchanged: a real rider creates at most a couple of reservations per sitting (`MAX_ACTIVE = 2` already caps concurrent ones), so 20/minute combined is still far above any plausible single-person tapping pattern, while low enough to stop a tight scripted loop within seconds. Set with headroom for a conference room sharing one public IP (several dozen people on the same WiFi could plausibly each tap "reserve" within the same minute during a demo) — a lower number risks throttling legitimate attendees at the exact event this work is timed around. Alternative considered: a much tighter limit (e.g., 5/minute). Rejected for the shared-IP demo-hall risk; can be tightened later if 20/minute proves too loose in practice.

**Action: block, not Managed Challenge.** A Managed Challenge assumes an interactive page render the caller can solve; `/ramp/reserve` is called via `fetch` from the SPA with no navigation, so a challenge response would just look like an inexplicable failure to a legitimate caller and to an attacker alike, without actually stopping the attacker (there's nothing to solve in an XHR context, so Cloudflare will typically fall back to blocking anyway) — worth stating explicitly rather than mis-configuring this the more common way (challenge as a default action).

**Same rule on stage.** `api-stage.rampme.site` gets the identical rule. It's equally public and equally worth protecting for availability; the fact that `hw-sim` has no physical actuator changes the severity of what a bypass could do, not whether the rate limit should exist.

## Risks / Trade-offs

[Shared conference/office IP throttles multiple legitimate users at once] → Mitigation: 20/minute threshold chosen with that scenario in mind; monitor during the actual Sept 10 demo and be ready to raise it via a fast `tofu apply` if it misfires live.

[A rule mismatch accidentally catches an SSE route] → Mitigation: route-path exclusion is explicit in the rule expression, not inferred; a task requires manually confirming SSE stays connected after the rule goes live, before treating this as done.

[Distributed multi-IP attack bypasses per-IP counting entirely] → Accepted as a residual risk for this proposal specifically (see Non-Goals). Not mitigated here because it requires backend-side state (a global ceiling), which is out of scope for an edge-only change. Worth a decision on whether it needs its own tracked issue or folds into rampme-software#41's broader scope — flagging rather than deciding unilaterally, since it wasn't part of the reviewed backlog.

[Cloudflare's zone-level rate limiting rule syntax/quota for this plan tier is unverified] → Resolved by the actual apply attempts, not by dashboard research beforehand (none was available): the `ratelimit.characteristics` field requires `cf.colo.id` alongside `ip.src` (counting is per-colocation, not global per IP — a client routed through multiple Cloudflare colos across requests gets a separate budget per colo, a real gap in per-IP coverage worth remembering alongside the distributed-multi-IP risk below), and this plan tier allows exactly one rule in the `http_ratelimit` phase, which is why create and cancel share one rule instead of one each.

## Migration Plan

Plain revert. A `cloudflare_ruleset` change applies live at Cloudflare's edge; rolling back is a `tofu apply` of the previous state (delete or restore the prior rule), with no data model and no feature flag involved. This does not touch the Cloudflare Tunnel resource, so the tunnel-replace danger documented in `fleet/tofu/tunnel.tf` does not apply here.
