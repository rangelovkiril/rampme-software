## 1. Verify plan capability

- [x] 1.1 Confirm the account's Cloudflare plan tier and which bot management product it includes. Answered: Free plan, Bot Fight Mode only. No per-route scoping — Bot Fight Mode "cannot be customized, adjusted, or reconfigured via WAF custom rules," runs outside the Ruleset Engine. Super Bot Fight Mode (Pro plan, has skip rules) not purchased; tracked as a deferred backlog issue instead.

## 2. Configuration

- [x] 2.1 Enable Bot Fight Mode at the zone level. **Not tofu-managed** — `cloudflare_bot_management`/`fight_mode` (`fleet/tofu/bot.tf`, fleet#18) kept failing `403`/code 10000 on apply even after adding `Zone / Bot Management / Edit` (fleet#19); Cloudflare's own docs only describe a dashboard procedure for this product, and community reports confirm the same failure on Free-plan zones regardless of scope. Concluded this is an API entitlement gate, not a permission gap (see `design.md`); dropped `bot.tf` (fleet#20) and enabled it by hand in the dashboard instead.
- [x] 2.2 ~~Configure the stricter action scoped to write routes only~~ — not achievable at this plan tier (see 1.1); superseded by 2.1's zone-wide toggle.
- [x] 2.3 No fallback tuning needed beyond 2.1: `fight_mode` is a single on/off setting with a fixed action, nothing to loosen or tighten.

## 3. Verify live

- [x] 3.1 Manually test that a basic scripted `curl` loop against `POST /ramp/reserve` is challenged. **Inconclusive, not broken**: a single bare `curl` request (no browser fingerprint at all) passed through as a normal `200`, not challenged — consistent with Bot Fight Mode's heuristics targeting sustained/reputation-based patterns rather than "any non-browser client," and with the framework's point that this product's exact trigger logic is an opaque Cloudflare implementation detail we don't control. No evidence either way that it deters a real scripted abuser; no evidence it breaks anything.
- [x] 3.2 Manually test that rapid map panning/zooming on the live frontend produces no challenged requests. Verified: `GET /stops` and the vehicle-position SSE stream both responded normally (200, streaming data) immediately after enabling.
- [x] 3.3 Manually test the normal reservation create/cancel flow from the deployed frontend still succeeds end to end. **This is the one that matters most.** Verified directly against production: create returned `200` with a well-formed reservation object, cancel returned `200`. Test reservations cleaned up afterward.

## 4. Docs

- [x] 4.1 Document the configuration (Bot Fight Mode, zone-wide, no scoping, dashboard-only, why) in the `fleet` wiki Operations page.
- [x] 4.2 Update `rampme-software.wiki`'s `Threat-Model.md` "Current containment" section to add bot mitigation alongside the WAF rate limit, including the accepted zone-wide risk.
- [x] 4.3 Opened fleet#17 tracking the Super Bot Fight Mode / Pro-plan upgrade for per-route scoping, explicitly deferred alongside rampme-software#83/#84 and fleet#10.
