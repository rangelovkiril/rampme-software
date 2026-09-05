## 1. Verify plan-tier capability

- [x] 1.1 Confirm the account's Cloudflare plan supports custom rate limiting rules with per-route matching and per-IP counting. Answered by the actual apply attempts (no dashboard access available to check beforehand): this plan tier allows exactly **one** rule in the `http_ratelimit` phase (not per-route matching — create and cancel share one rule), only a **10-second** counting period (not 60s), and a `mitigation_timeout` that must equal that period. See `design.md`.

## 2. Ruleset (fleet/tofu)

- [x] 2.1 Add a `cloudflare_ruleset` resource rate-limiting `POST /ramp/reserve` and `DELETE /ramp/reserve/:id` by source IP at 5 requests/10s combined (one rule, 10s period — this plan tier's limits, see 1.1) (`fleet/tofu/waf.tf`). Verified: `tofu fmt` clean, and `tofu validate` passes against the real `cloudflare/cloudflare` v5.24.0 provider schema in an isolated scratch config each time (no state or credentials touched — this repo's committed state is SOPS-encrypted and deliberately left alone; the real `tofu plan`/`apply` against the live account runs in `fleet`'s CI).
- [x] 2.2 Exclude `/ramp/session/stream`, `/realtime/vehicles/stream`, and `/realtime/vehicles/:id/trip/etas` by construction: the rule's match expression only matches `POST /ramp/reserve` and `DELETE /ramp/reserve/*`, so the SSE routes never match rather than being excluded by a separate clause.
- [x] 2.3 Set the rule's action to `block` (non-interactive), not Managed Challenge.
- [x] 2.4 Apply the identical rule to `api-stage.rampme.site`: both hostnames are matched via a single `http.host in {...}` clause in each rule's expression.

## 3. Apply and verify live

- [x] 3.1 Run the change through the `fleet` CI pipeline (PR -> plan in job summary -> manual approval -> apply). Five apply-time errors found in sequence and fixed as each appeared — token scope, `cf.colo.id` characteristic, one-rule-per-phase quota, 10s-only period, mitigation_timeout must equal period (fleet#12, #14, #15, #16) — final apply succeeded.
- [x] 3.2 Manually verify SSE streams stay connected after the rule is live. Verified: `GET /realtime/vehicles/stream` against `api.rampme.site` streamed normal vehicle data during and after the burst test in 3.3, unaffected.
- [x] 3.3 Manually verify a scripted burst of `POST /ramp/reserve` against the live API gets rejected. Verified directly against production: 8 sequential requests from 8 distinct (fake) session ids, same source IP — requests 1-5 succeeded (200), requests 6-8 rejected (429), matching the configured 5-per-10s threshold exactly. Test reservations cancelled afterward to leave the DB clean.
- [x] 3.4 Manually verify normal reservation create/cancel from the deployed frontend still succeeds end to end. Verified at the API level (same endpoints the frontend calls): create returned a well-formed reservation object, cancel returned `200`. Not separately driven through the browser UI — no browser-automation tool was available this session.

## 4. Docs

- [x] 4.1 Document the rule in the `fleet` wiki Operations page — updated to say it's live with the real (not originally-designed) numbers, once 3.1-3.4 confirmed that.
- [x] 4.2 Update `rampme-software.wiki`'s `Threat-Model.md` "Current containment" section to mark the WAF rule as implemented, with the real thresholds.
- [x] 4.3 Checked off the rate-limit and wiki-documentation acceptance criteria on `fleet` issue #1 via a comment; left the issue open since the other two criteria (bot patterns, SSE/normal-usage confirmation as a closing action) belong to `cloudflare-bot-mitigation`. Noted the residual distributed-multi-IP risk there too, since it wasn't part of the originally reviewed backlog and doesn't have its own issue yet.
