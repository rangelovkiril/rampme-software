## 1. Verify plan-tier capability

- [ ] 1.1 Confirm the account's Cloudflare plan supports custom rate limiting rules with per-route matching and per-IP counting, verify by checking the dashboard's Rate Limiting Rules page or the `cloudflare_ruleset` docs against the current plan.

## 2. Ruleset (fleet/tofu)

- [ ] 2.1 Add a `cloudflare_ruleset` resource rate-limiting `POST /ramp/reserve` and `DELETE /ramp/reserve/:id` by source IP at 20 requests/minute, verify via `tofu plan` showing the expected rule.
- [ ] 2.2 Exclude `/ramp/session/stream`, `/realtime/vehicles/stream`, and `/realtime/vehicles/:id/trip/etas` from the rule's match expression, verify the plan output shows those paths excluded.
- [ ] 2.3 Set the rule's action to a non-interactive block (not Managed Challenge), verify by reading the configured action in the plan.
- [ ] 2.4 Apply the identical rule to `api-stage.rampme.site`, verify the plan covers both hostnames.

## 3. Apply and verify live

- [ ] 3.1 Run the change through the `fleet` CI pipeline (PR -> plan in job summary -> manual approval -> apply), verify the job summary matches what was authored in 2.1-2.4.
- [ ] 3.2 Manually verify SSE streams stay connected after the rule is live: open the map, confirm live vehicle updates and the ramp session stream keep flowing without interruption.
- [ ] 3.3 Manually verify a scripted burst of `POST /ramp/reserve` against the live API gets rejected before backend logs show the request, verify via backend logs showing no corresponding entries past the threshold.
- [ ] 3.4 Manually verify normal reservation create/cancel from the deployed frontend still succeeds end to end.

## 4. Docs

- [ ] 4.1 Document the rule (thresholds, excluded paths, rollback command) in the `fleet` wiki Operations page.
- [ ] 4.2 Update `rampme-software.wiki`'s `Threat-Model.md` "Current containment" section to mark the WAF rule as implemented, replacing the "effectively no custom rules" statement.
- [ ] 4.3 Close out `fleet` issue #1's acceptance criteria to match what actually shipped, and note the residual distributed-multi-IP risk from this design as a comment for a follow-up decision.
