## Context

See `proposal.md` - Why for the motivation. Two facts shape this design:

- The two datasets this feature needs have very different volatility: `model -> low_floor` (~225 rows, curated from Wikipedia/manufacturer sources, corrected by hand as needed) changes a handful of times a year at most; `inventory -> model` (crowd-sourced from trinmo.org's per-model photo galleries, ~2300 rows across 49 currently-active models) changes as vehicles are repainted, retired, or newly photographed, and is rebuilt by crawling ~50 endpoint calls against an undocumented, unauthenticated internal API with no published SLA.
- `fleet`'s backend PVC (`rampme-backend-data`, holding `ramp.db`) is `ReadWriteOnce`, and per the fleet wiki two pods must never hold it at once — ruling out a periodic pod co-mounting it. `fleet` already has a working pattern for "an external process periodically commits a small update, Flux applies it": `ImageUpdateAutomation` does exactly this for image tags today.

## Goals / Non-Goals

**Goals:**
- Ship a real, non-`unknown` accessibility signal for the live fleet, with zero runtime dependency on trinmo.org.
- Keep the reference dataset current without manual re-curation, and without adding cluster-side infrastructure (CronJob, RBAC) for what is fundamentally "fetch, join, publish."
- Never assert ramp-equipped/not-ramp-equipped on a resolution that identity reuse makes ambiguous (see spec's "No confident false positive" requirement).

**Non-Goals:**
- A general crowdsourced-reporting pipeline (raised during exploration as a longer-term alternative to trinmo) — not needed now that the trinmo join is validated; revisit only if trinmo access degrades.
- A live merge/override mechanism reconciling trinmo's native `specifications.accessibility` field against the curated model table — see Decisions.

## Decisions

**Two independent static datasets, not one.** `model -> low_floor` (`backend/src/gtfs/model-accessibility.json`) stays a checked-in, hand-curated, PR-reviewed file. `inventory -> model` is rebuilt entirely by the crawl and never hand-edited. Keeping them separate means the volatile, crowd-sourced part can be thrown away and rebuilt at any time without touching curated data.

**The crawl runs in GitHub Actions, not in the cluster.** `backend/scripts/refresh-accessibility.ts` (the join logic) stays versioned next to the curated table it reads, since it's application logic. But *running* it doesn't need to happen inside the cluster or the backend's own Docker image — `.github/workflows/refresh-accessibility.yaml` runs it on a weekly schedule using GitHub's own compute, then commits the result directly into `fleet` as a plain `ConfigMap` YAML (`kubectl create configmap --dry-run=client`, no live cluster access needed to generate it). Flux applies it from there exactly like every other change. This needed zero new in-cluster infrastructure — no `CronJob`, no `ServiceAccount`/`Role`/`RoleBinding`, no extra container images — by reusing the same commit-and-let-Flux-apply pattern `ImageUpdateAutomation` already uses for image tags.

**Delivery is a `ConfigMap` shared by both environments, not a `PersistentVolume`.** `apps/rampme/backend/accessibility-refresh/` is a third sibling next to `base/` and `overlays/{production,stage}/` in the `fleet` repo — not nested under either overlay, since both `overlays/production` and `overlays/stage` already pull in `base/` under one merged `apps/` Kustomization; putting it under `base/` would register the same `ConfigMap` twice and fail the build, and putting it under `overlays/production/` only would misrepresent something both environments consume as production-owned. `base/deployment.yaml` mounts the `ConfigMap` as a second, `optional: true` volume (the file didn't always exist historically; `optional` costs nothing to keep) at a path distinct from the `ramp.db` PVC, with `RAMP_ACCESSIBILITY_DATA_PATH` set there for both Deployments.

**Vehicle type comes from the `vehicle.id` prefix itself, not a separate route lookup.** Every live sample observed had a prefix (`A`/`TM`/`TB`) matching the GTFS static route-id prefix scheme for that vehicle's own route, confirmed against a full daytime capture (200 concurrent vehicles across all three types). Parsing type directly off `vehicle.id` avoids a dependency on trip/route resolution succeeding first.

**Reference dataset re-read is time-based, not file-watched.** The backend reloads the accessibility file from disk on a fixed interval (`RAMP_ACCESSIBILITY_REFRESH_MS`, default 1h) — enough to pick up a weekly refresh promptly, and composes with kubelet's own periodic re-sync of mounted `ConfigMap` volumes (projected files update in place, no pod restart needed).

**`"Частично нископодов"` (partially low-floor) resolves to not-ramp-equipped, not unknown.** Partial low-floor doesn't guarantee a mechanized wheelchair ramp exists, and the spec's false-positive guarantee takes precedence over optimism.

## Risks / Trade-offs

- **[Coverage gaps for never-photographed vehicles]** → falls back to `unknown` per spec; expected to shrink as trinmo's community photographs more of the fleet.
- **[trinmo.org changes shape or becomes unreachable]** → the workflow fails, `fleet` keeps whatever was last committed (per spec's refresh-failure requirement — stale, not wrong). The only contact point with trinmo is the one script.
- **[trinmo.org has no published ToS for reuse]** → mitigated by low request volume (~50 requests/week, well under its 500/min rate limit) and the civic/non-commercial nature of the use.
- **[`FLEET_REPO_TOKEN` is a new credential]** → a PAT scoped to `fleet`'s `contents: write` only, stored as a `rampme-software` repo secret; narrower than the alternative (a classic `gist`-scoped PAT, which grants access to every gist on the account — `GITHUB_TOKEN` cannot write gists at all, gists sit outside its repo-scoped permission model entirely).

## Migration Plan

Purely additive, no schema migration. New env var `RAMP_ACCESSIBILITY_DATA_PATH` (code default `./data/vehicle-accessibility.json`, overridden in `fleet`'s `base/deployment.yaml` to the `ConfigMap`-mounted path) and `RAMP_ACCESSIBILITY_REFRESH_MS` (default `3600000`). The loader treats a missing/unparseable file as `unknown` for every lookup, so nothing breaks regardless of which pieces exist yet. Rollback is a plain revert on the `rampme-software` side; on `fleet`'s side, deleting `accessibility-refresh/` and the Deployment patch's env var + volume falls back to the code default path, safe by the same missing-file behavior.

## Open Questions

None.
