## Context

See `proposal.md` - Why for the motivation. Two facts shape this design:

- The two datasets this feature needs have very different volatility: `model -> low_floor` (~225 rows, curated from Wikipedia/manufacturer sources, corrected by hand as needed) changes a handful of times a year at most; `inventory -> model` (crowd-sourced from trinmo.org's per-model photo galleries, ~2300 rows across 49 currently-active models) changes as vehicles are repainted, retired, or newly photographed, and is rebuilt by crawling ~50 endpoint calls against an undocumented, unauthenticated internal API with no published SLA.
- The join itself (fetch, filter by in-service status and expected type, join against the curated table) is small and dependency-free — not complex enough to need this repo's TypeScript/TypeBox/test machinery running inside the cluster or the backend's own Docker image.
- `fleet`'s backend PVC (`rampme-backend-data`, holding `ramp.db`) is `ReadWriteOnce`, and per the fleet wiki two pods must never hold it at once — ruling out a periodic pod co-mounting it. `fleet` already has a working pattern for "an external process periodically commits a small update, Flux applies it": `ImageUpdateAutomation` does exactly this for image tags today.

## Goals / Non-Goals

**Goals:**
- Ship a real, non-`unknown` accessibility signal for the live fleet, with zero runtime dependency on trinmo.org.
- Keep the reference dataset current without manual re-curation, and without adding cluster-side infrastructure (CronJob, RBAC, new credentials) for what is fundamentally "fetch, join, publish."
- Never assert ramp-equipped/not-ramp-equipped on a resolution that identity reuse makes ambiguous (see spec's "No confident false positive" requirement).

**Non-Goals:**
- A general crowdsourced-reporting pipeline (raised during exploration as a longer-term alternative to trinmo) — not needed now that the trinmo join is validated; revisit only if trinmo access degrades.
- A live merge/override mechanism reconciling trinmo's native `specifications.accessibility` field against the curated model table — see Decisions.

## Decisions

**Two independent static datasets, not one.** `model -> low_floor` (`backend/src/gtfs/model-accessibility.json`) stays a checked-in, hand-curated, PR-reviewed file in this repo. `inventory -> model` is rebuilt entirely by the crawl and never hand-edited.

**The crawl lives outside both repos, as a gist — not as code in either.** It's genuinely small (fetch, filter, join, write; no external dependencies) and doesn't need this repo's TypeScript/TypeBox/`bun:test` machinery, or a place in `fleet`'s stricter ask-before-commit workflow, to exist. It's a plain, dependency-free Node script (gist: `https://gist.github.com/rangelovkiril/8288bc4d272915fe86414526242fb276`) that fetches `model-accessibility.json` straight from this repo's `raw.githubusercontent.com` URL for the join, so the curated table still lives, and is still PR-reviewed, in exactly one place. `fleet`'s own scheduled workflow (`.github/workflows/refresh-accessibility.yaml`, not this repo's CI) curls the gist, runs it, and commits the result directly to `fleet`'s `main` — mirroring how `ImageUpdateAutomation` already commits image tags there. Because the workflow commits to the repo it runs in, the default `GITHUB_TOKEN` (`permissions: contents: write`) is enough; no cross-repo PAT, no in-cluster `CronJob`, no `ServiceAccount`/`Role`/`RoleBinding`.

**Delivery is a `ConfigMap` shared by both environments, not a `PersistentVolume`.** `apps/rampme/accessibility/` sits directly under `apps/rampme/`, a sibling of `backend/` and `hw-sim/`, not nested inside `backend/`'s `base/overlays` tree — both overlays already merge `backend/base/` into one `apps/` Kustomization, so a resource placed there or duplicated per-overlay would register twice and fail the build; it also isn't really part of the Deployment base/overlay pattern, just something `backend/` happens to consume. `backend/base/deployment.yaml` mounts the `ConfigMap` as a second, `optional: true` volume at a path distinct from the `ramp.db` PVC, with `RAMP_ACCESSIBILITY_DATA_PATH` set there for both Deployments.

**Vehicle type comes from the `vehicle.id` prefix itself, not a separate route lookup.** Every live sample observed had a prefix (`A`/`TM`/`TB`) matching the GTFS static route-id prefix scheme for that vehicle's own route, confirmed against a full daytime capture (200 concurrent vehicles across all three types).

**Reference dataset re-read is time-based, not file-watched.** The backend reloads the accessibility file from disk on a fixed interval (`RAMP_ACCESSIBILITY_REFRESH_MS`, default 1h), composing with kubelet's own periodic re-sync of mounted `ConfigMap` volumes.

**`"Частично нископодов"` (partially low-floor) resolves to not-ramp-equipped, not unknown.** Partial low-floor doesn't guarantee a mechanized wheelchair ramp exists, and the spec's false-positive guarantee takes precedence over optimism.

## Risks / Trade-offs

- **[Coverage gaps for never-photographed vehicles]** → falls back to `unknown` per spec; expected to shrink as trinmo's community photographs more of the fleet.
- **[trinmo.org changes shape or becomes unreachable]** → the workflow fails, `fleet` keeps whatever was last committed (per spec's refresh-failure requirement — stale, not wrong).
- **[trinmo.org has no published ToS for reuse]** → mitigated by low request volume (~50 requests/week, well under its 500/min rate limit) and the civic/non-commercial nature of the use.
- **[The crawl script lives in a gist, not version control with review history]** → accepted trade-off for keeping it out of both repos' stricter processes; the gist has its own (thinner) revision history, and its failure mode is the same as any other source degrading — `fleet` just keeps serving the last good commit. Losing `bun:test` coverage of the join logic is real, but the logic is small and the safety property (never guess, only resolve or fall back to unknown) is simple enough to verify by reading it.

## Migration Plan

Purely additive, no schema migration. New env var `RAMP_ACCESSIBILITY_DATA_PATH` (code default `./data/vehicle-accessibility.json`, overridden in `fleet`'s `base/deployment.yaml` to the `ConfigMap`-mounted path) and `RAMP_ACCESSIBILITY_REFRESH_MS` (default `3600000`). The loader treats a missing/unparseable file as `unknown` for every lookup, so nothing breaks regardless of which pieces exist yet. Rollback is a plain revert on the `rampme-software` side; on `fleet`'s side, deleting `apps/rampme/accessibility/`, its workflow, and the Deployment patch's env var + volume falls back to the code default path, safe by the same missing-file behavior.

## Open Questions

None.
