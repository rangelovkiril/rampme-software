## 1. SECURITY.md

- [x] 1.1 Write root `SECURITY.md`: scope (backend, frontend, `hw-sim` as a test double — explicitly not production hardware firmware, which lives in `rampme-hardware`), the project-specific severity scale (physical/mechanical actuation > availability > everything else), and a pointer to GitHub's private vulnerability reporting as the sole channel. Verify by confirming the file renders under the repo's Security tab with a working "Report a vulnerability" button.

## 2. Threat model wiki sync (rampme-software.wiki, separate repo)

- [ ] 2.1 Reframe the two-reservation session cap in `Threat-Model.md`'s "Current containment" as a UX safety net against accidental double-submission, not an abuse-containment layer. Verify by re-reading the section and confirming it no longer implies protection against a scripted client.
- [ ] 2.2 Add the existing per-vehicle single-flight deploy guard (`isDeployInFlight`, `backend/src/services/ramp/bridge.ts`) to "Current containment" as a mechanism that already exists. Verify by citing the exact file/function.
- [ ] 2.3 Add "fleet-wide spray" (one actor targeting many vehicles at once) and "mechanical wear via route pre-staging" (reservations staged across a whole route to trigger repeated deploys) as named risks under "what is actually at risk". Verify each links to its backlog issue (fleet-wide spray to the residual-risk note in `waf-abuse-containment`'s design; mechanical wear to rampme-software#83).
- [ ] 2.4 Add the delegation test (bounded blast radius: cheap-to-recover-from + edge has superior visibility → delegate; otherwise keep in backend logic) as its own section. Verify it reads as a reusable test, not a one-off justification.
- [ ] 2.5 Name the adversary profile (opportunistic griefer / curious engineer, not an organized attacker) explicitly, tied to the existing "cost of abuse above nuisance-value payoff" framing. Verify the wording makes clear this is a stated assumption, not an absolute limit.
- [ ] 2.6 Add a second, explicit trust boundary for the MQTT/physical hardware path (a compromised or physically-extracted device credential), distinct from the Cloudflare edge boundary already described. Verify it names fleet#10 as the deferred mitigation.
- [ ] 2.7 Add a "known gaps, deliberately deferred" list linking rampme-software#40, #41, #83, #84 and fleet#10, one sentence each on why it isn't closed now. Verify every linked issue number resolves correctly.
- [ ] 2.8 Mirror sections 2.1-2.7 into `Threat-Model-BG.md`, matching the wiki's existing bilingual convention. Verify both language versions stay in sync section-for-section.

## 3. Verification

- [ ] 3.1 Confirm `SECURITY.md` is picked up by GitHub (Security tab shows the policy and the private-reporting entry point).
- [ ] 3.2 Confirm the wiki pages render correctly on GitHub after push (no broken issue links, no broken cross-repo links to `fleet`).
