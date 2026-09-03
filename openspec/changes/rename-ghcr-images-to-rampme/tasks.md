## 1. rampme-software: publish the renamed images

- [ ] 1.1 Update `backend.yaml`'s `IMAGE` env var from `ghcr.io/${{ github.repository_owner }}/hacktues12-backend` to `.../rampme-backend`.
- [ ] 1.2 Update `hw-sim.yaml`'s `IMAGE` env var from `ghcr.io/${{ github.repository_owner }}/hacktues12-hw-sim` to `.../rampme-hw-sim`.
- [ ] 1.3 Merge to `main` and verify: `rampme-backend` gets `sha-<commit>` + `stage-<ts>` tags on push, then a `prod-<ts>` tag after promote; `rampme-hw-sim` gets `sha-<commit>` + `stage-<ts>` tags. Confirm via `gh api /users/rangelovkiril/packages?package_type=container` (or the package settings page) that both packages' connected repository is `rampme-software`, not `hackaton-pre`. Do not proceed to section 2 until real tags exist.

## 2. fleet: backend overlays point at rampme-backend

- [ ] 2.1 Update `apps/rampme/backend/base/deployment.yaml`'s container image to `ghcr.io/rangelovkiril/rampme-backend:unset`.
- [ ] 2.2 Update `apps/rampme/backend/overlays/production/imagerepository.yaml`'s `spec.image` to `ghcr.io/rangelovkiril/rampme-backend`, and `overlays/production/deployment-patch.yaml`'s image line to a real `rampme-backend:prod-<ts>` tag produced in 1.3 (marker stays `{"$imagepolicy": "rampme:rampme-backend"}`, object name unchanged).
- [ ] 2.3 Update `apps/rampme/backend/overlays/stage/imagerepository.yaml`'s `spec.image` to `ghcr.io/rangelovkiril/rampme-backend`, and `overlays/stage/deployment-patch.yaml`'s image line to a real `rampme-backend:stage-<ts>` tag from 1.3 (marker stays `{"$imagepolicy": "rampme:rampme-backend-stage"}`, object name unchanged).

## 3. fleet: rename hw-sim to rampme-hw-sim and point at the new image

- [ ] 3.1 Rename `apps/rampme/hw-sim/imagerepository.yaml`'s `metadata.name` from `hw-sim` to `rampme-hw-sim` and set `spec.image` to `ghcr.io/rangelovkiril/rampme-hw-sim`.
- [ ] 3.2 Rename `apps/rampme/hw-sim/imagepolicy.yaml`'s `metadata.name` to `rampme-hw-sim` and update `spec.imageRepositoryRef.name` to match.
- [ ] 3.3 In `apps/rampme/hw-sim/deployment.yaml`, rename `metadata.name`, `spec.selector.matchLabels.app`, and the pod template's `app` label from `hw-sim` to `rampme-hw-sim`; set the image line to a real `rampme-hw-sim:stage-<ts>` tag from 1.3; update the marker to `{"$imagepolicy": "rampme:rampme-hw-sim"}`.
- [ ] 3.4 In `apps/rampme/hw-sim/service.yaml`, rename `metadata.name` and update `spec.selector.app` to `rampme-hw-sim`.
- [ ] 3.5 In `apps/rampme/backend/overlays/stage/deployment-patch.yaml`, update the `MQTT_URL` env var from `mqtt://hw-sim:1883` to `mqtt://rampme-hw-sim:1883`, in the same commit as 3.4.
- [ ] 3.6 Merge and verify via `kubectl get imagerepository,imagepolicy,deployment,service -n rampme` that the old bare-`hw-sim`-named objects are gone (pruned by the `apps` Kustomization's `prune: true`) and only `rampme-hw-sim`-named ones remain; verify `kubectl get endpoints rampme-hw-sim -n rampme` shows a populated endpoint (Service still routes to the renamed pod).

## 4. Verify the end-to-end rollout

- [ ] 4.1 After the next image push post-cutover, confirm in `fleet`'s commit log that the `ImageUpdateAutomation` bot commit touches all three lines (`rampme-backend`, `rampme-backend-stage`, `rampme-hw-sim`) - not silently skipped, which would indicate a marker/name mismatch.
- [ ] 4.2 Confirm production and stage backend pods, and the hw-sim pod, are `Running` with the new image names via `kubectl get pods -n rampme -o jsonpath='{.items[*].spec.containers[*].image}'`.
- [ ] 4.3 Confirm the stage backend actually reaches hw-sim over MQTT after the `rampme-hw-sim` Service rename: check stage backend pod logs for a successful MQTT connection, not repeated DNS/connection errors against the old `hw-sim` hostname.

## 5. Documentation

- [ ] 5.1 Fix `fleet`'s `README.md`: replace the stale `apps/rampme/backend/deployment.yaml` path reference with the actual `base/deployment.yaml` + `overlays/{production,stage}/deployment-patch.yaml` structure, and update the `rampme-backend` example to match the renamed image.
- [ ] 5.2 Fix `fleet`'s `AGENTS.md` with the same stale-path correction as 5.1.
- [ ] 5.3 Update the software wiki's `CI-CD.md`: replace the "leftover from the hackathon... cosmetic and deferred" note (backend section) to state the images are now `rampme-backend`/`rampme-hw-sim`, and add the equivalent note to the hw-sim section noting its rename too.
- [ ] 5.4 Apply the same update to `CI-CD-BG.md`, keeping the bilingual pair in sync.
