## 1. Verify plan capability

- [x] 1.1 Confirm the account's Cloudflare plan tier and which bot management product it includes. Answered: Free plan, Bot Fight Mode only. No per-route scoping — Bot Fight Mode "cannot be customized, adjusted, or reconfigured via WAF custom rules," runs outside the Ruleset Engine. Super Bot Fight Mode (Pro plan, has skip rules) not purchased; tracked as a deferred backlog issue instead.

## 2. Configuration

- [x] 2.1 Enable `cloudflare_bot_management` with `fight_mode = true` at the zone level (`fleet/tofu/bot.tf`, fleet#18, merged). Verified: `tofu fmt` clean, `tofu validate` passes against the real `cloudflare/cloudflare` v5.24.0 provider schema in an isolated scratch config (no state/credentials touched). **Blocked**: first apply failed — `403`, code 10000, on `PUT .../zones/{zone_id}/bot_management` — missing `Zone / Bot Management / Edit` token scope, a separate permission from `Zone / Zone WAF / Edit`. Fix in fleet#19; still needs merge + re-run. Also surfaced: `cloudflare_bot_management` cannot be destroyed by OpenTofu once created (documented in fleet#19), so rollback is toggling `fight_mode`, never removing the resource — matches the plan already in `design.md`.
- [ ] 2.2 ~~Configure the stricter action scoped to write routes only~~ — not achievable at this plan tier (see 1.1); superseded by 2.1's zone-wide toggle.
- [ ] 2.3 No fallback tuning needed beyond 2.1: `fight_mode` is a single on/off setting with a fixed action, nothing to loosen or tighten.

## 3. Verify live

- [ ] 3.1 Manually test that a basic scripted `curl` loop against `POST /ramp/reserve` is challenged.
- [ ] 3.2 Manually test that rapid map panning/zooming on the live frontend produces no challenged requests.
- [ ] 3.3 Manually test the normal reservation create/cancel flow from the deployed frontend still succeeds end to end. **This is the one that matters most** — if it fails, disable `fight_mode` immediately rather than leaving it enabled while investigating.

## 4. Docs

- [ ] 4.1 Document the configuration (Bot Fight Mode, zone-wide, no scoping, why) in the `fleet` wiki Operations page.
- [ ] 4.2 Update `rampme-software.wiki`'s `Threat-Model.md` "Current containment" section to add bot mitigation alongside the WAF rate limit, including the accepted zone-wide risk.
- [x] 4.3 Opened fleet#17 tracking the Super Bot Fight Mode / Pro-plan upgrade for per-route scoping, explicitly deferred alongside rampme-software#83/#84 and fleet#10.
