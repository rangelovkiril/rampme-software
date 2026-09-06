## Context

See `proposal.md` - Why for the motivation. Two facts shape this design:

- The two datasets this feature needs have very different volatility: `model -> low_floor` (~225 rows, curated from Wikipedia/manufacturer sources, corrected by hand as needed) changes a handful of times a year at most; `inventory -> model` (crowd-sourced from trinmo.org's per-model photo galleries, ~2300 rows across 49 currently-active models) changes as vehicles are repainted, retired, or newly photographed, and is rebuilt by crawling ~50 endpoint calls against an undocumented, unauthenticated internal API with no published SLA.
- `fleet` already runs a k3s cluster managed by Flux; a `CronJob` mounting a `PersistentVolume` is an established, low-effort pattern there, not new infrastructure.

## Goals / Non-Goals

**Goals:**
- Ship a real, non-`unknown` accessibility signal for the live fleet by 2026-09-10, with zero runtime dependency on trinmo.org.
- Keep the reference dataset current without manual re-curation: a scheduled job rebuilds it; nobody edits inventory data by hand.
- Never assert ramp-equipped/not-ramp-equipped on a resolution that identity reuse makes ambiguous (see spec's "No confident false positive" requirement).

**Non-Goals:**
- A general crowdsourced-reporting pipeline (raised during exploration as a longer-term alternative to trinmo) — not needed now that the trinmo join is validated; revisit only if trinmo access degrades.
- Exhaustive coverage measurement across a full daytime service peak — the validated sample so far is 8/8 night-bus vehicles. Worth doing, but it's a follow-up measurement, not a blocker: the unknown-fallback makes gaps safe rather than wrong.
- A live merge/override mechanism reconciling trinmo's native `specifications.accessibility` field against the curated `sofia_transport_low_floor.json` — see Decisions.

## Decisions

**Two independent static datasets, not one.** `model -> low_floor` stays a checked-in, hand-curated JSON (today's `sofia_transport_low_floor.json`, moved under `backend/`). `inventory -> model` is rebuilt entirely by the scheduled job and never hand-edited. Keeping them separate means the volatile, crowd-sourced part can be thrown away and rebuilt at any time without touching curated data, and vice versa.

**Fix the 3 known model-table disagreements by hand now, no runtime merge logic.** Cross-checking trinmo's own `specifications.accessibility` field against the curated table surfaced 3 mismatches (Waggon AG Be 4-6, Т8М-700/M, Т8М-700IT — all old trams/trolleys, unlikely to be live in current service). Correcting those 3 rows directly in the curated file is simpler and safer under deadline than building a live two-source-of-truth override mechanism for a handful of edge cases. `"Частично нископодов"` (partially low-floor) and mixed-batch values resolve to **not-ramp-equipped**, not unknown: partial low-floor doesn't guarantee a mechanized wheelchair ramp exists, and the spec's false-positive guarantee takes precedence over optimism.

**The scheduled job runs the backend's own image, not new fleet-repo logic.** The crawl (trinmo fleet-list → per-model detail pages → filter by `status: "В движение"` and expected type → join against the curated model table) is application logic that must stay versioned next to the curated table it joins against, so it ships as a script in this repo (`backend/scripts/refresh-accessibility.ts` or similar), invoked by the `fleet` repo's `CronJob` as an alternate command on the same container image already built for the API. `fleet` only owns the schedule and the mounted volume, not the join logic.

**Vehicle type comes from the `vehicle.id` prefix itself, not a separate route lookup.** Every live sample observed had a prefix (`A`/`TM`/`TB`) matching the GTFS static route-id prefix scheme for that vehicle's own route. Parsing type directly off `vehicle.id` avoids a dependency on trip/route resolution succeeding first, and is one less thing that can disagree with itself.

**Reference dataset re-read is time-based, not file-watched.** The backend loads the accessibility file into memory at startup and reloads it on a fixed interval (new `RAMP_ACCESSIBILITY_REFRESH_MS` env var, default 1h) — enough to pick up a weekly `CronJob` refresh promptly without adding filesystem-watch complexity for a dataset that changes at most weekly.

## Risks / Trade-offs

- **[Coverage gaps for never-photographed vehicles]** → falls back to `unknown` per spec; expected to shrink over time as trinmo's community photographs more of the fleet. No action needed now.
- **[trinmo.org changes shape or becomes unreachable]** → the scheduled job just fails silently-to-stale; the API keeps serving the last successfully built dataset (per spec's refresh-failure requirement). The only single-point-of-contact with trinmo is the one script, easy to swap or drop if needed.
- **[Validated on only 8 live (night-bus) vehicles so far]** → not blocking, since the failure mode for an unvalidated vehicle is `unknown`, not a wrong answer. A daytime-peak validation pass is recommended as a fast-follow, not a task here.
- **[trinmo.org has no published ToS for reuse]** → mitigated by low request volume (~50 requests/week from the cron job, well under its 500/min rate limit) and the civic/non-commercial nature of the use; the single-script boundary above makes this easy to reconsider later without touching the rest of the system.

## Migration Plan

Purely additive, no schema migration. New env var `RAMP_ACCESSIBILITY_DATA_PATH` (default e.g. `./data/vehicle-accessibility.json`) and `RAMP_ACCESSIBILITY_REFRESH_MS` (default `3600000`). If the file at that path doesn't exist yet, the loader treats every lookup as `unknown` — today's existing behavior — so the backend can deploy before the `fleet` CronJob and its volume exist, and accessibility data appears automatically once the CronJob first populates the mount, with no backend redeploy required. Rollback is a plain revert: removing the lookup restores the always-`unknown` status quo, no data cleanup needed on either side.

## Open Questions

- Live trolleybus samples (`TB` prefix) haven't been directly observed yet — only inferred from the GTFS static route-id prefix scheme, since no trolleybus was running during the (night-time) capture window. Worth confirming against a daytime capture during implementation; doesn't change the approach if it turns out to need a different prefix.
