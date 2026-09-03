## Context

See `proposal.md` - Why. Two independent, separately-deployed repos are involved: `rampme-software` (publishes the images via GitHub Actions) and `fleet` (Flux GitOps, consumes them). Flux's `ImageUpdateAutomation` uses the `strategy: Setters` model: it only rewrites an image tag on a line carrying a `# {"$imagepolicy": "rampme:<policyName>"}` marker that matches an existing `ImagePolicy` object name exactly. A renamed `ImagePolicy` with a stale marker, or a marker with no matching `ImagePolicy`, is not an error Flux surfaces loudly - it just silently stops updating that line.

## Goals / Non-Goals

**Goals:**
- Rename the two published images and make their GHCR "connected repository" correctly `rampme-software`, without any action in `hackaton-pre`.
- Bring every hw-sim-related object - Deployment, ImageRepository, ImagePolicy, and Service - in line with backend's existing `rampme-<app>` / `rampme-<app>-stage` convention, so no hw-sim identifier is left as a bare, un-prefixed exception.
- Sequence the two-repo rollout so there is no window where Flux expects an image that does not exist yet.

**Non-Goals:**
- Anything in `hackaton-pre`/`hackaton-pre-infra`, or deleting/re-linking the old `hacktues12-*` GHCR packages (see proposal.md).
- Any change to app runtime behavior, the ramp MQTT protocol, or CORS.

## Decisions

**Rename via new GHCR package names, not manual re-link of the old ones.** A GHCR package's "connected repository" isn't something `rampme-software`'s workflow can set via the Docker/GHA API; it's inferred from whichever repo/token first pushes a given name, or fixed by hand in the GitHub package settings UI. Pushing under new names (`rampme-backend`, `rampme-hw-sim`) makes `rampme-software` the first publisher automatically - no manual, unversioned UI step, and it also fixes the naming itself instead of leaving `hacktues12-*` in place with a relinked owner. Alternative considered and rejected: keep the old names, manually re-point their "connected repository" in GitHub's package settings. Rejected because it's an out-of-band, non-reviewable action, does nothing about the naming inconsistency that started this exploration, and leaves the name still collision-exposed to `hackaton-pre`'s CI.

**hw-sim's Service also renames to `rampme-hw-sim`, not just its selector.** Reconsidered from an earlier draft that kept the Service bare as `hw-sim`. That exception didn't hold up: the `rampme` namespace already disambiguates every hw-sim object just as much as it disambiguates the Service, yet Deployment/ImageRepository/ImagePolicy still get the `rampme-` prefix for cross-context readability (grep, PR diffs, commit history) - carving out the Service as the one bare name recreates the exact kind of "cosmetic, deferred" naming debt this change exists to close, on the same reasoning that let `hacktues12-*` linger. The coupling risk (the `MQTT_URL: mqtt://hw-sim:1883` literal in the backend stage overlay) doesn't shrink by leaving the Service name alone - it only gets deferred to whenever someone finally does rename it, without the advantage of already being in these exact files. Renaming now costs one more literal-string edit in a commit that's already touching `service.yaml` and the stage overlay for the selector-label sync (see Risks below); doing it later costs the same edit plus rediscovery. The Service's `selector.app` **and** `metadata.name` move to `rampme-hw-sim` together, and `MQTT_URL` in `backend/overlays/stage/deployment-patch.yaml` updates to `mqtt://rampme-hw-sim:1883` in the same commit.

**Convention: `rampme-<app>` for an app's default/only role, `rampme-<app>-stage` for an explicit non-default role.** Matches backend's existing prod (unsuffixed) / stage (suffixed) split, applied to hw-sim (`hw-sim` -> `rampme-hw-sim`, no `-stage` suffix since it has only one role). Alternative considered and rejected: fully explicit suffixes everywhere (`rampme-backend-prod`, `rampme-hw-sim-stage`). Rejected as unnecessary churn to backend's already-correct prod objects for no disambiguation benefit - hw-sim has nothing to disambiguate from.

**Two-PR rollout, `rampme-software` first.** The `fleet` manifests need a real, already-pushed tag to reference in `deployment-patch.yaml`/`deployment.yaml` (Flux does not deploy speculatively). Sequencing:
1. Merge the `rampme-software` workflow rename to `main`. The next `backend`/`hw-sim` push produces real `rampme-backend`/`rampme-hw-sim` images tagged `sha-<commit>` + `stage-<ts>`, and backend's promote job produces a `prod-<ts>` tag.
2. Only then, open the `fleet` PR: swap `ImageRepository.spec.image`, rename hw-sim's `ImageRepository`/`ImagePolicy`/Deployment/Service-selector, and set the Deployment's initial image ref to one of the tags produced in step 1. Update the `$imagepolicy` marker text (`rampme:hw-sim` -> `rampme:rampme-hw-sim`) in the same commit as the `ImagePolicy` rename.
3. Old `ImageRepository`/`ImagePolicy` objects pointing at `hacktues12-*` are deleted as part of the same `fleet` change (they'd otherwise sit forever with no new matching tags, since `rampme-software` no longer pushes there).

Until step 2 lands, `rampme-software`'s CI is publishing images nobody deploys yet - harmless, just wasted registry storage for one review cycle.

No app config or runtime environment variables change; `IMAGE` is a CI-only workflow variable, not something the running app reads.

## Risks / Trade-offs

- **Marker/name drift breaks automation silently.** Renaming hw-sim's `ImagePolicy` without updating its `$imagepolicy` marker in the same commit stops `ImageUpdateAutomation` from ever touching that Deployment line again, with no error surfaced - it just stops rolling. Mitigation: rename the Flux object and update its marker in one commit (Decision above), and after merge check the `ImageUpdateAutomation`'s next commit on `fleet` actually touches the hw-sim line.
- **Service selector left stale.** If the Deployment's pod-template label moves to `app: rampme-hw-sim` but the Service selector isn't updated in the same commit, hw-sim becomes unreachable (Service resolves to zero endpoints) - silent until the stage MQTT flow is exercised. Mitigation: both edits land in the same commit; verify with `kubectl get endpoints rampme-hw-sim -n rampme` after rollout.
- **`MQTT_URL` literal left pointing at the old Service name.** Renaming the Service to `rampme-hw-sim` without updating `MQTT_URL: mqtt://hw-sim:1883` in the backend stage overlay breaks stage MQTT connectivity via DNS resolution failure - also silent until exercised, and in a different file in a different overlay from the Service rename itself, so it's easy to land one without the other. Mitigation: both edits are the same tasks.md task (section 3); verify stage backend logs show a successful MQTT connection after rollout, not repeated connection errors.
- **Cross-repo sequencing window.** If the `fleet` PR merges before `rampme-software`'s new images exist, Flux has nothing matching its filter and the Deployment's initial static image ref would 404 on pull. Mitigation: strict ordering (Decision above) - don't open the `fleet` PR until the first `rampme-backend`/`rampme-hw-sim` tags are confirmed in GHCR.

## Migration Plan

Two sequential PRs, one per repo, as in Decisions above. Rollback is a plain revert, made easy by the choice to leave old packages untouched: reverting the `fleet` PR alone points the manifests back at `hacktues12-backend`/`hacktues12-hw-sim` and a last-known-good tag, both of which still exist in GHCR unmodified, so the cluster returns to its prior working state without needing to also revert `rampme-software`. Reverting the `rampme-software` workflow rename is optional and independent - leaving it renamed causes no harm even if `fleet` is rolled back, it just means new pushes keep landing in the new, still-unused package.

## Open Questions

None - the decisions with real trade-offs (Service rename scope, sequencing) are resolved above rather than deferred.
