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

**The crawl's output is baked into the Docker image as a bootstrap seed, not left to depend on the `fleet` CronJob existing.** `model -> low_floor` was already effectively "in the container" for free the moment it's a checked-in source file — no cron ever needed there. The volatile half (`inventory -> model`) is the one that actually needs periodic refreshing, but "needs periodic refreshing to stay current" and "needs infrastructure to have *any* data on day one" are different problems; conflating them would have made the demo depend on `fleet` work with no relation to this repo's own release cadence. `scripts/refresh-accessibility.ts`'s output is checked in as `gtfs/vehicle-accessibility.seed.json` and the `Dockerfile` copies it to `RAMP_ACCESSIBILITY_DATA_PATH`'s default location at build time, so every image ships with a working (if slowly staling) answer, refreshed for free on each rebuild in the meantime. The `fleet` CronJob (task group 4) remains the right long-term freshness mechanism — it just stops being a blocker for getting anything onto production at all.

## Risks / Trade-offs

- **[Coverage gaps for never-photographed vehicles]** → falls back to `unknown` per spec; expected to shrink over time as trinmo's community photographs more of the fleet. No action needed now.
- **[trinmo.org changes shape or becomes unreachable]** → the scheduled job just fails silently-to-stale; the API keeps serving the last successfully built dataset (per spec's refresh-failure requirement). The only single-point-of-contact with trinmo is the one script, easy to swap or drop if needed.
- **[Validated on only 8 live (night-bus) vehicles so far]** → not blocking, since the failure mode for an unvalidated vehicle is `unknown`, not a wrong answer. A daytime-peak validation pass is recommended as a fast-follow, not a task here.
- **[trinmo.org has no published ToS for reuse]** → mitigated by low request volume (~50 requests/week from the cron job, well under its 500/min rate limit) and the civic/non-commercial nature of the use; the single-script boundary above makes this easy to reconsider later without touching the rest of the system.
- **[Volume-mount shadowing, for whoever picks up task group 4]** → once the `fleet` CronJob's `PersistentVolume` gets mounted at the same path as the baked-in seed, an empty PVC (before the CronJob's first run) will shadow the seed and briefly regress every vehicle back to `unknown`. Sequence it so the CronJob populates the volume before the Deployment starts mounting it there (a pre-existing PVC seeded by a one-off `Job`, or an init container that copies the baked-in file into the volume if it's empty) — don't just add the mount and assume the baked-in data carries over.

## Migration Plan

Purely additive, no schema migration. New env var `RAMP_ACCESSIBILITY_DATA_PATH` (default e.g. `./data/vehicle-accessibility.json`) and `RAMP_ACCESSIBILITY_REFRESH_MS` (default `3600000`). The loader treats a missing/unparseable file as `unknown` for every lookup — today's existing behavior — so nothing breaks if the baked-in seed is ever absent (e.g. a manual build that skips the `Dockerfile`'s `COPY` step). In the ordinary case, the seed baked into the image means accessibility data is present from the very next deploy, with no dependency on `fleet` CronJob work landing first; once it does land, mounting its volume over the same path takes over as the live source of truth (see the volume-mount-shadowing risk above for sequencing that safely). Rollback is a plain revert: removing the lookup restores the always-`unknown` status quo, no data cleanup needed on either side.

## Open Questions

None remaining. The one open question this design started with — whether live trolleybus `vehicle.id` values actually carry the `TB` prefix, unconfirmed at design time because no trolleybus was running during the original (night-time) capture — was resolved during implementation: a full daytime capture (200 concurrent vehicles: 116 bus, 44 tram, 40 trolleybus) confirmed the `TB` prefix and got real resolutions for 24/40 trolleybuses. See tasks.md 5.2 for the full match-rate breakdown.
