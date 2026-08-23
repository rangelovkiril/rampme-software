## 1. hw-sim: app scaffold

- [ ] 1.1 Create the `hw-sim/` app directory with `package.json`, `tsconfig`/`biome` config matching `backend/`'s conventions, and an entry point; verify `bun install` succeeds inside `hw-sim/`
- [ ] 1.2 Add `hw-sim/Dockerfile` following `backend/Dockerfile`'s compile-to-binary shape; verify `docker build hw-sim` produces a runnable image locally
- [ ] 1.3 Add `hw-sim/AGENTS.md` (with `CLAUDE.md` symlinked to it, per the existing `backend/`/`frontend/` pattern) describing the app's structure, the ramp MQTT protocol subset it implements, and its environment variables; verify the symlink resolves and the file documents every env var introduced in this group
- [ ] 1.4 Update root `AGENTS.md`'s app listing ("This repo... holds both apps: `backend/` and `frontend/`") to include `hw-sim/` and link its `AGENTS.md`, matching how `backend/AGENTS.md` and `frontend/AGENTS.md` are already linked

## 2. hw-sim: simulator implementation

- [ ] 2.1 Start an in-process MQTT broker on a configurable port and accept unauthenticated connections; verify a plain MQTT client can connect and subscribe without credentials
- [ ] 2.2 Implement per-vehicle reservation tracking from `new_reservation`/`cancel_reservation` commands on `ramp/{vehicle_id}/cmd`; verify with a test that publishing both in sequence leaves no outstanding reservation for that vehicle
- [ ] 2.3 Implement the happy-path deploy sequence: on a `deploy` command, publish `deploying`, `deployed`, `done` in order on `ramp/{vehicle_id}/state`; verify with a test asserting message order and topic
- [ ] 2.4 Implement the "no-ack" and "error" profiles (per `specs/ramp/hardware-simulator/spec.md`); verify with tests that "no-ack" publishes nothing and "error" publishes only an `error` state
- [ ] 2.5 Implement `POST /vehicles/:vehicleId/profile` to switch a single vehicle's active profile at runtime, defaulting to the happy-path profile for any vehicle not explicitly set; verify with a test that changing one vehicle's profile does not affect another vehicle's next `deploy` outcome
- [ ] 2.6 Add a `bun:test` suite under `hw-sim/test/` covering 2.2-2.5; verify `bun run test` passes in `hw-sim/`
- [ ] 2.7 Add `hw-sim`'s own `bun run check` (biome + tsc) config; verify it passes with zero errors

## 3. hw-sim: CI

- [ ] 3.1 Add `.github/workflows/hw-sim.yaml` mirroring `.github/workflows/backend.yaml`'s `check` and `build-image` jobs (tagging `stage-<timestamp>` in GHCR), with no `promote` job since this image never ships to production; verify a PR touching `hw-sim/**` triggers `check`, and a push to `main` also builds and pushes an image

## 4. backend: remove the dead mock flag

- [ ] 4.1 Remove `mockRamp` from `backend/src/config/index.ts`; verify `bun run check` passes with no remaining references
- [ ] 4.2 Remove the `MOCK_RAMP` row and prose from `backend/AGENTS.md`'s environment variable table and the "Starts without a broker" paragraph
- [ ] 4.3 Remove the `MOCK_RAMP` mention from `README.md` and `.github/README.bg.md`

## 5. frontend: hostname-based API resolution

- [ ] 5.1 Add the hostname-to-API lookup to `frontend/src/lib/config.ts`'s `apiPath()` resolution: explicit build-time `NEXT_PUBLIC_API_URL` wins; else `rampme.site` -> production API; else `staging.rampme.pages.dev` -> stage API; else -> stage API; verify with a unit-style test or `bun run check` plus a manual check of each branch
- [ ] 5.2 Add a code comment in `lib/config.ts` cross-referencing the CORS origin allowlist in `backend/src/index.ts`; verify the comment names the exact allowlist location
- [ ] 5.3 Update `frontend/AGENTS.md`'s `NEXT_PUBLIC_API_URL` row to describe the new precedence (explicit override, then hostname lookup, then stage fallback) instead of "build-time backend base URL"
- [ ] 5.4 Confirm `frontend/e2e` tests still pass unaffected (they run against a local/dev backend via the existing rewrite proxy, not the new hostname branch); verify `bun run test:e2e` passes

## 6. fleet: hw-sim deployment (separate repository, separate PR)

- [ ] 6.1 Add `apps/rampme/hw-sim/{deployment,service,imagerepository,imagepolicy,kustomization}.yaml`, following `apps/rampme/backend/`'s shape but with no `pvc.yaml`, `secret.yaml`, or `httproute.yaml`; verify `kustomize build apps/rampme` includes the new resources without errors
- [ ] 6.2 Add `hw-sim` as a resource in `apps/rampme/kustomization.yaml`; verify the same `kustomize build` output includes it

## 7. fleet: backend-stage deployment (separate repository, separate PR)

- [ ] 7.1 Add `apps/rampme/backend-stage/{deployment,service,pvc,imagerepository,imagepolicy,kustomization}.yaml`, copying `apps/rampme/backend/`'s shape with: `MQTT_URL` set to hw-sim's in-cluster address, no `secret.yaml`, its own `PersistentVolumeClaim` (1Gi), and an `ImagePolicy` filtering `^stage-(?P<ts>[0-9]+)$`; verify `kustomize build apps/rampme` includes the new resources without errors
- [ ] 7.2 Add `backend-stage` as a resource in `apps/rampme/kustomization.yaml`; verify Flux reconciles the new `Deployment` to `Running` after merge (`flux get kustomizations` / `kubectl get pods -n rampme`)

## 8. fleet: public exposure for backend-stage (separate repository, separate PR, manual apply)

- [ ] 8.1 Add a second listener (e.g. `rampme-api-stage`, hostname `api-stage.rampme.site`) to `infrastructure/configs/envoy-gateway/gateway.yaml`; verify `kubectl get gateway eg -n envoy-gateway-system` shows both listeners as `Programmed`
- [ ] 8.2 Add `apps/rampme/backend-stage/httproute.yaml` referencing the new `sectionName`; verify `curl https://api-stage.rampme.site/health` returns `Ok` once DNS/tunnel routing (8.3-8.4) is in place
- [ ] 8.3 Add a new ingress rule for `api-stage.rampme.site` to the existing `cloudflare_zero_trust_tunnel_cloudflared_config` resource in `tofu/tunnel.tf`; verify `tofu plan` shows an in-place update (not a replacement) of that resource before running `tofu apply`
- [ ] 8.4 Add a `cloudflare_dns_record` for `api-stage.rampme.site` in `tofu/dns.tf`, matching `api.rampme.site`'s existing proxied CNAME shape; verify `tofu apply` succeeds and the hostname resolves

## 9. Documentation sync (wiki)

- [ ] 9.1 Update the [Ramp MQTT Protocol wiki page](https://github.com/rangelovkiril/rampme-software/wiki/Ramp-MQTT-Protocol) to reference `hw-sim` as its executable reference implementation
- [ ] 9.2 Update the [fleet wiki](https://github.com/rangelovkiril/fleet/wiki) infrastructure runbook with the new `backend-stage`/`hw-sim` workloads, the `api-stage.rampme.site` hostname, and the manual OpenTofu step from group 8

## 10. End-to-end verification

- [ ] 10.1 With `backend-stage` and `hw-sim` both deployed and `api-stage.rampme.site` reachable, manually create a ramp reservation against the stage backend and confirm the full `pending -> active -> done` sequence completes using hw-sim's default profile
- [ ] 10.2 Switch a vehicle's hw-sim profile to `no-ack` via its control endpoint and confirm a reservation against that vehicle expires after `DEPLOY_TIMEOUT_MS`, exercising the timeout path this change was built to make testable
- [ ] 10.3 Load the frontend from `https://staging.rampme.pages.dev` and confirm (via browser devtools network tab) that API calls go to `api-stage.rampme.site`, not `api.rampme.site`
