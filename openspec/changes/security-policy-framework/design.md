## Context

See `proposal.md` for motivation. The current `Threat-Model.md` already states the core accessibility constraint (no login, so defenses move off the critical path) and names two live mechanisms (the Cloudflare WAF, currently with no custom rules, and the two-reservation session cap). A review against the actual code (`backend/src/db/ramp.ts`, `backend/src/services/ramp/bridge.ts`, `backend/src/services/ramp/proximity.ts`, `frontend/contexts/RampContext.tsx`) found the session cap is enforced against a value (`X-Session-Id`) the client generates unilaterally (`crypto.randomUUID()`, no server issuance, no signature, format-only validation), and that an existing containment mechanism (single-flight deploy per vehicle) isn't documented at all.

## Goals / Non-Goals

**Goals:**
- Establish a reusable test for whether a containment control belongs at the Cloudflare edge or in backend logic, so future proposals apply it instead of re-arguing it.
- Make `Threat-Model.md` describe what is actually true today, not what sounds protective.
- Give the private-vulnerability-reporting channel (already enabled on GitHub) a severity scale suited to a system with no money or user data at risk.
- Name the realistic adversary explicitly, so "why not defend against X" has a standing answer.

**Non-Goals:**
- Not implementing WAF rules or bot mitigation (separate proposals: `waf-abuse-containment`, `cloudflare-bot-mitigation`).
- Not implementing per-device MQTT ACLs (fleet#10), the exponential backoff ban ladder (rampme-software#40), pattern-based abuse detection (rampme-software#83), or the driver-side feedback view (rampme-software#84). All four are deliberately deferred; this change only has to state why in one sentence each, not design them.
- Not chasing perfect prevention. The existing threat model's framing (keep the cost of abuse above a griefer's nuisance-value payoff) stays the goal; this change formalizes it, it doesn't raise the bar.

## Decisions

**Delegation test: bounded blast radius, not raw capability.** A containment control is delegated to the Cloudflare edge when (a) a wrong edge decision is cheap to recover from (a false 429 is retriable, not physically consequential) and (b) Cloudflare structurally sees more than RampMe's own traffic could ever show it (cross-customer bot/IP-reputation signal). A control stays in backend logic when it needs state the edge cannot have (which vehicle is mid-deploy, how many reservations a session already holds) or when a wrong decision has a physical consequence. Alternative considered: justify each edge-vs-backend placement case by case per proposal. Rejected — it already produced inconsistent framing during review (the session cap was described as abuse containment when it functions as a UX safety net), and repeating the argument three times (framework, WAF, bot mitigation) invites drift between them.

**Named adversary: opportunistic griefer, not an organized attacker.** Concretely: someone with `curl`, browser devtools, or a basic script, motivated by curiosity or nuisance value, not a resourced or persistent actor (botnet operator, professional fraud ring). Alternative considered: defend against an unbounded "any attacker" model. Rejected — an unbounded adversary makes every control look insufficient by construction (a distributed swarm defeats per-IP rate limiting; a real browser defeats bot scoring), which stalls prioritization instead of guiding it. The existing wiki already implies this profile ("nuisance value" payoff); this makes it a named, citable assumption instead of an implication.

**Project-specific severity scale, not CVSS.** Ordered: physical/mechanical actuation impact (an attacker can trigger or block ramp deployment) > availability impact (map or API degraded) > everything else (for example, information disclosure of already-public GTFS data, which is close to zero severity here since the data has no confidentiality requirement). Alternative considered: adopt CVSS as-is for the reporting triage. Rejected — CVSS's base metrics are built around confidentiality/integrity/availability of data and systems with monetary or privacy stakes, neither of which describes RampMe; forcing a report into that rubric would produce a score that doesn't reflect what actually matters here.

**Reporting channel: point at what's already enabled, add nothing new.** `SECURITY.md` documents GitHub's private vulnerability reporting (`private-vulnerability-reporting.enabled: true`, confirmed via the GitHub API) as the sole channel. Alternative considered: a dedicated security-contact email. Rejected — a second channel is a second thing to monitor and keep current for a single maintainer, with no capability the first channel lacks.

**Same edge posture for stage and production; severity ceiling differs.** `api-stage.rampme.site` is still public and still worth protecting for availability (it's what a demo or a curious visitor would hit first if they found it), so WAF/bot-mitigation rules apply to it identically. What differs is severity: stage backs onto `hw-sim`, which accepts unauthenticated MQTT connections by design and has no physical actuator, so a report against stage's MQTT path cannot exceed the availability tier on the severity scale above, no matter how it reads on the surface.

## Risks / Trade-offs

[Naming a bounded adversary could read as complacency if a differently-resourced attacker shows up] → Mitigation: state the bound explicitly as a current assumption tied to the product having no money or data at stake, and revisit it if that ever changes (a real incident, a change in what the product handles) rather than defending against a hypothetical from day one.

[The wiki is a separate repository with no PR review — a bad edit publishes immediately] → Mitigation: keep the wiki sync as its own explicit, reviewed-in-conversation task rather than folding it into another task, per the project's existing rule for wiki-touching tasks.

## Migration Plan

Plain revert. This change is documentation only — no runtime behavior, no data migration, no feature flag. Reverting `SECURITY.md` or the wiki pages is a normal revert/edit with no rollback complexity.
