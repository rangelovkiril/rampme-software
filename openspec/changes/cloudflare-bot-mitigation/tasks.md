## 1. Verify plan capability

- [ ] 1.1 Confirm the account's Cloudflare plan tier and which bot management product it includes (Bot Fight Mode vs. Super Bot Fight Mode) and whether per-route scoping is available, verify by checking the dashboard's Bot Fight Mode settings for the zone.

## 2. Configuration

- [ ] 2.1 Enable bot management at the zone level per 1.1's finding, verify via dashboard or a `cloudflare` Terraform resource if the plan tier exposes one.
- [ ] 2.2 Configure the stricter action (block or non-interactive challenge) scoped to `POST /ramp/reserve` and `DELETE /ramp/reserve/:id` only, verify the rule/expression targets only those routes.
- [ ] 2.3 If per-route scoping isn't available at this plan tier, configure the loosest zone-wide action that still meaningfully raises cost for scripted `/ramp/*` traffic, and verify map panning against the live site isn't degraded before treating this as done.

## 3. Verify live

- [ ] 3.1 Manually test that a basic scripted `curl` loop against `POST /ramp/reserve` is blocked or non-interactively challenged.
- [ ] 3.2 Manually test that rapid map panning/zooming on the live frontend produces no blocked or challenged requests.
- [ ] 3.3 Manually test the normal reservation create/cancel flow from the deployed frontend still succeeds end to end.

## 4. Docs

- [ ] 4.1 Document the bot management configuration (product tier used, scoped routes, fallback if per-route scoping wasn't available) in the `fleet` wiki Operations page.
- [ ] 4.2 Update `rampme-software.wiki`'s `Threat-Model.md` "Current containment" section to add bot mitigation alongside the WAF rate limit.
