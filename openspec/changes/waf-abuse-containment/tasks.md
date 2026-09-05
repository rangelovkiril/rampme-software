## 1. Verify plan-tier capability

- [x] 1.1 Confirm the account's Cloudflare plan supports custom rate limiting rules with per-route matching and per-IP counting. Answered by the actual apply attempts (no dashboard access available to check beforehand): this plan tier allows exactly **one** rule in the `http_ratelimit` phase (not per-route matching — create and cancel share one rule) and only a **10-second** counting period (not 60s). See `design.md`.

## 2. Ruleset (fleet/tofu)

- [x] 2.1 Add a `cloudflare_ruleset` resource rate-limiting `POST /ramp/reserve` and `DELETE /ramp/reserve/:id` by source IP at 5 requests/10s combined (one rule, 10s period — this plan tier's limits, see 1.1) (`fleet/tofu/waf.tf`). Verified: `tofu fmt` clean, and `tofu validate` passes against the real `cloudflare/cloudflare` v5.24.0 provider schema in an isolated scratch config each time (no state or credentials touched — this repo's committed state is SOPS-encrypted and deliberately left alone; the real `tofu plan`/`apply` against the live account runs in `fleet`'s CI).
- [x] 2.2 Exclude `/ramp/session/stream`, `/realtime/vehicles/stream`, and `/realtime/vehicles/:id/trip/etas` by construction: the rule's match expression only matches `POST /ramp/reserve` and `DELETE /ramp/reserve/*`, so the SSE routes never match rather than being excluded by a separate clause.
- [x] 2.3 Set the rule's action to `block` (non-interactive), not Managed Challenge.
- [x] 2.4 Apply the identical rule to `api-stage.rampme.site`: both hostnames are matched via a single `http.host in {...}` clause in each rule's expression.

## 3. Apply and verify live

- [ ] 3.1 Run the change through the `fleet` CI pipeline (PR -> plan in job summary -> manual approval -> apply). **Blocked**: four apply-time errors found in sequence, each fixed as it appeared — token scope (fleet#12), `cf.colo.id` characteristic (fleet#12), one-rule-per-phase quota (fleet#14), and 10s-only period (fleet#15). Still needs fleet#15 merged and the Apply job run again.
- [ ] 3.2 Manually verify SSE streams stay connected after the rule is live. **Pending merge + apply.**
- [ ] 3.3 Manually verify a scripted burst of `POST /ramp/reserve` against the live API gets rejected. **Pending merge + apply.**
- [ ] 3.4 Manually verify normal reservation create/cancel from the deployed frontend still succeeds end to end. **Pending merge + apply.**

## 4. Docs

- [x] 4.1 Document the rule in the `fleet` wiki Operations page — worded as authored/pending the pipeline, not yet live, to avoid overclaiming ahead of 3.1.
- [ ] 4.2 Update `rampme-software.wiki`'s `Threat-Model.md` "Current containment" section to mark the WAF rule as implemented. **Deliberately not done yet** — it isn't implemented until 3.1 clears; doing this now would make the wiki inaccurate, which is exactly what this whole change exists to stop doing.
- [ ] 4.3 Close out `fleet` issue #1's acceptance criteria to match what actually shipped, and note the residual distributed-multi-IP risk from this design as a comment for a follow-up decision. **Pending merge + apply.**
