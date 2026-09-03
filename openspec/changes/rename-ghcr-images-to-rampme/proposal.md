## Why

The backend and hw-sim container images are still published as `hacktues12-backend`/`hacktues12-hw-sim`, a hackathon-era name that no longer matches anything else in the system (namespace `rampme`, Deployment `rampme-backend`, capability docs). Worse than the naming itself: on GHCR, the `hacktues12-backend` package (and a dead, unpublished `hacktues12-frontend` package) are still "connected" to `rangelovkiril/hackaton-pre`, the original hackathon starter repo, not to `rampme-software`, which is the repo that actually builds and ships them today. That repo still has a working CI workflow that pushes into the exact same `hacktues12-*` GHCR names, so the current production image lineage sits on a shared, ambiguous namespace it doesn't own. Flux's resource naming is also internally inconsistent: backend follows a `rampme-backend` (default role) / `rampme-backend-stage` (explicit role) convention, while hw-sim's ImageRepository/ImagePolicy/Deployment are just `hw-sim`, with neither the `rampme-` prefix nor a role suffix.

## What Changes

- Rename the published images: `hacktues12-backend` -> `rampme-backend`, `hacktues12-hw-sim` -> `rampme-hw-sim`. Because these are new GHCR package names, `rampme-software`'s own CI becomes their first (and only) publisher, so they come up already connected to the correct repo with no action needed in `hackaton-pre`.
- Update the `IMAGE` env var in `rampme-software`'s `backend.yaml` and `hw-sim.yaml` workflows to the new names.
- Update `fleet`'s Flux manifests (backend `base/` + `overlays/production/` + `overlays/stage/`, and `hw-sim/`) to track the renamed images.
- Apply one consistent Flux resource-naming convention across both apps: `rampme-<app>` for an app's default/only role, `rampme-<app>-stage` for an explicit non-default role. Concretely, this renames hw-sim's ImageRepository, ImagePolicy, and Deployment from bare `hw-sim` to `rampme-hw-sim` (it has no prod role, so no `-stage` suffix is needed, mirroring how backend's prod ImageRepository/ImagePolicy stay unsuffixed).
- Fix stale doc drift found in `fleet`'s `README.md` and `AGENTS.md`: both still describe the backend Deployment as a flat `apps/rampme/backend/deployment.yaml`, which predates the `base/` + `overlays/{production,stage}/` split.
- Update the software wiki's `CI-CD.md`/`CI-CD-BG.md`, which currently documents the old name as "a leftover from the hackathon... cosmetic and deferred" for backend only, and never mentions hw-sim's identical baggage.
- **Explicitly out of scope**: `hackaton-pre` (and `hackaton-pre-infra`) are not touched in any way - no CI edits, no permission changes, no archival decision. The old `hacktues12-backend`, `hacktues12-hw-sim`, and `hacktues12-frontend` GHCR packages are left as-is; no deletion, no re-linking. Renaming forward makes the old names irrelevant without requiring any of that.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. This is a pure infra/naming change: no rider-facing or downstream-system-facing behavior changes. `skip_specs: true` is set in this change's `.openspec.yaml`.

## Impact

- `.github/workflows/backend.yaml`: `IMAGE` env var (`hacktues12-backend` -> `rampme-backend`).
- `.github/workflows/hw-sim.yaml`: `IMAGE` env var (`hacktues12-hw-sim` -> `rampme-hw-sim`).
- `fleet` repo:
  - `apps/rampme/backend/base/deployment.yaml` (base image ref)
  - `apps/rampme/backend/overlays/production/imagerepository.yaml`, `imagepolicy.yaml`, `deployment-patch.yaml`
  - `apps/rampme/backend/overlays/stage/imagerepository.yaml`, `imagepolicy.yaml`, `deployment-patch.yaml`
  - `apps/rampme/hw-sim/imagerepository.yaml`, `imagepolicy.yaml`, `deployment.yaml` (image ref + resource rename to `rampme-hw-sim`)
  - `README.md`, `AGENTS.md` (stale `apps/rampme/backend/deployment.yaml` path references)
- Software wiki: `CI-CD.md`, `CI-CD-BG.md` (hackathon-leftover note, backend + hw-sim).
- GHCR: new `ghcr.io/rangelovkiril/rampme-backend` and `ghcr.io/rangelovkiril/rampme-hw-sim` packages, first published by `rampme-software`'s CI. Old `hacktues12-*` packages and `rangelovkiril/hackaton-pre` are unaffected.
