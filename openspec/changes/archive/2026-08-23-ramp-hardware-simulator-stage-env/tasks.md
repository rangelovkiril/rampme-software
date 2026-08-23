## 1. hw-sim: app scaffold

- [x] 1.1 Create the `hw-sim/` app directory with `package.json`, `tsconfig`/`biome` config matching `backend/`'s conventions, and an entry point; verify `bun install` succeeds inside `hw-sim/`
- [x] 1.2 Add `hw-sim/Dockerfile` following `backend/Dockerfile`'s compile-to-binary shape; verify `docker build hw-sim` produces a runnable image locally
- [x] 1.3 Add `hw-sim/AGENTS.md` (with `CLAUDE.md` symlinked to it, per the existing `backend/`/`frontend/` pattern) describing the app's structure, the ramp MQTT protocol subset it implements, and its environment variables; verify the symlink resolves and the file documents every env var introduced in this group
- [x] 1.4 Update root `AGENTS.md`'s app listing ("This repo... holds both apps: `backend/` and `frontend/`") to include `hw-sim/` and link its `AGENTS.md`, matching how `backend/AGENTS.md` and `frontend/AGENTS.md` are already linked

## 2. hw-sim: simulator implementation

- [x] 2.1 Start an in-process MQTT broker on a configurable port and accept unauthenticated connections; verify a plain MQTT client can connect and subscribe without credentials
- [x] 2.2 Implement per-vehicle reservation tracking from `new_reservation`/`cancel_reservation` commands on `ramp/{vehicle_id}/cmd`; verify with a test that publishing both in sequence leaves no outstanding reservation for that vehicle
- [x] 2.3 Implement the happy-path deploy sequence: on a `deploy` command, publish `deploying`, `deployed`, `done` in order on `ramp/{vehicle_id}/state`; verify with a test asserting message order and topic
- [x] 2.4 Implement the "no-ack" and "error" profiles (per `specs/ramp/hardware-simulator/spec.md`); verify with tests that "no-ack" publishes nothing and "error" publishes only an `error` state
- [x] 2.5 Implement `POST /vehicles/:vehicleId/profile` to switch a single vehicle's active profile at runtime, defaulting to the happy-path profile for any vehicle not explicitly set; verify with a test that changing one vehicle's profile does not affect another vehicle's next `deploy` outcome
- [x] 2.6 Add a `bun:test` suite under `hw-sim/test/` covering 2.2-2.5; verify `bun run test` passes in `hw-sim/`
- [x] 2.7 Add `hw-sim`'s own `bun run check` (biome + tsc) config; verify it passes with zero errors

## 3. hw-sim: CI

- [x] 3.1 Add `.github/workflows/hw-sim.yaml` mirroring `.github/workflows/backend.yaml`'s `check` and `build-image` jobs (tagging `stage-<numeric-timestamp>` in GHCR, e.g. `date -u +%Y%m%d%H%M%S` — the fleet-side `ImagePolicy` in group 7 requires a purely numeric timestamp to extract and order on), with no `promote` job since this image never ships to production; verify a PR touching `hw-sim/**` triggers `check`, and a push to `main` also builds and pushes an image

## 4. backend: remove the dead mock flag

- [x] 4.1 Remove `mockRamp` from `backend/src/config/index.ts`; verify `bun run check` passes with no remaining references
- [x] 4.2 Remove the `MOCK_RAMP` row and prose from `backend/AGENTS.md`'s environment variable table and the "Starts without a broker" paragraph
- [x] 4.3 Remove the `MOCK_RAMP` mention from `README.md` and `.github/README.bg.md`

## 5. frontend: hostname-based API resolution

- [x] 5.1 Add the hostname-to-API lookup to `frontend/lib/config.ts`'s `apiPath()` resolution: explicit build-time `NEXT_PUBLIC_API_URL` wins; else `NODE_ENV === 'development'` -> `/api` (unchanged local-dev rewrite proxy); else `rampme.site` -> production API; else `staging.rampme.pages.dev` -> stage API; else -> stage API; verify with a unit-style test or `bun run check` plus a manual check of each branch
- [x] 5.2 Add a code comment in `lib/config.ts` cross-referencing the CORS origin allowlist in `backend/src/index.ts`; verify the comment names the exact allowlist location
- [x] 5.3 Update `frontend/AGENTS.md`'s `NEXT_PUBLIC_API_URL` row to describe the new precedence (explicit override, then hostname lookup, then stage fallback) instead of "build-time backend base URL"
- [x] 5.4 Confirm `frontend/e2e` tests still pass unaffected (they run against a local/dev backend via the existing rewrite proxy, not the new hostname branch); verify `bun run test:e2e` passes
- [x] 5.5 Remove the baked `NEXT_PUBLIC_API_URL: https://api.rampme.site` from `.github/workflows/frontend.yaml`'s `deploy-staging` job, so the one build artifact produced by the `build` job (already built with `NEXT_PUBLIC_API_URL` unset) is deployed unchanged to both staging and production; verify no step in the workflow sets `NEXT_PUBLIC_API_URL`
- [x] 5.6 Add a `bun:test` unit suite (`frontend/lib/config.test.ts`, `bun run test`) covering every `apiPath()` branch: explicit `NEXT_PUBLIC_API_URL` override, `NODE_ENV=development` -> `/api`, production hostname, stage hostname, and unrecognized hostname -> stage; wire `bun run test` into `.github/workflows/frontend.yaml`'s `build` job; verify `bun run test` and `bun run check` both pass

## 6. fleet: hw-sim deployment (separate repository, separate PR)

- [x] 6.1 Add `apps/rampme/hw-sim/{deployment,service,imagerepository,imagepolicy,kustomization}.yaml`, following `apps/rampme/backend/`'s shape but with no `pvc.yaml`, `secret.yaml`, or `httproute.yaml`. The `Service` exposes both `hw-sim` ports (`1883` MQTT, `4000` HTTP control API — see `hw-sim/AGENTS.md`'s environment variable table for `MQTT_PORT`/`PORT`), since task 10.2 needs the control API reachable in-cluster; verify `kustomize build apps/rampme` includes the new resources without errors
- [x] 6.2 Add `hw-sim` as a resource in `apps/rampme/kustomization.yaml`; verify the same `kustomize build` output includes it

## 7. fleet: backend-stage deployment (separate repository, separate PR)

- [x] 7.1 Restructure `apps/rampme/backend/` into a Kustomize `base/` (shared `Deployment`/`Service` shape) plus `overlays/production/` and `overlays/stage/` (each with its own `pvc.yaml`, `imagerepository.yaml`, `imagepolicy.yaml`, name/image/env patches); `overlays/stage` sets `MQTT_URL` to hw-sim's in-cluster address, has no `secret.yaml`, its own `PersistentVolumeClaim` (1Gi), and an `ImagePolicy` filtering `^stage-(?P<ts>[0-9]+)$`. Diverges from this task's original "copy the files" wording — see design.md's updated decision for why (`kubectl kustomize` verified `overlays/production` renders byte-identical to the pre-restructure live manifests, and `overlays/stage` renders as a fully independent, correctly-selectored peer)
- [x] 7.2 Reference `backend/overlays/production` and `backend/overlays/stage` as resources in `apps/rampme/kustomization.yaml`; merged and reconciled — verified indirectly (no direct cluster access from this session) via a live end-to-end reservation against `backend-stage` (see 10.1) and `curl https://api-stage.rampme.site/health` returning `Ok`, both of which require the `Deployment` to be `Running`

## 8. fleet: public exposure for backend-stage (separate repository, separate PR, manual apply)

- [x] 8.1 Add a second listener (e.g. `rampme-api-stage`, hostname `api-stage.rampme.site`) to `infrastructure/configs/envoy-gateway/gateway.yaml`; merged and reconciled — verified indirectly, same evidence as 7.2 (a `Programmed` listener is a precondition for the `HTTPRoute` in 8.2 to work at all)
- [x] 8.2 Add `apps/rampme/backend/overlays/stage/httproute.yaml` referencing the new `sectionName`; merged and reconciled — `curl https://api-stage.rampme.site/health` returns `Ok`
- [x] 8.3 Add a new ingress rule for `api-stage.rampme.site` to the existing `cloudflare_zero_trust_tunnel_cloudflared_config` resource in `tofu/tunnel.tf`; verify `tofu plan` shows an in-place update (not a replacement) of that resource before running `tofu apply`
- [x] 8.4 Add a `cloudflare_dns_record` for `api-stage.rampme.site` in `tofu/dns.tf`, matching `api.rampme.site`'s existing proxied CNAME shape; verify `tofu apply` succeeds and the hostname resolves

## 9. Documentation sync (wiki)

- [x] 9.1 Update the [Ramp MQTT Protocol wiki page](https://github.com/rangelovkiril/rampme-software/wiki/Ramp-MQTT-Protocol) to reference `hw-sim` as its executable reference implementation; also swept `Contributing` and `CI-CD` (EN+BG) for the same stale `MOCK_RAMP`/baked-`NEXT_PUBLIC_API_URL` references
- [x] 9.2 Update the [fleet wiki](https://github.com/rangelovkiril/fleet/wiki) infrastructure runbook with the new `backend-stage`/`hw-sim` workloads, the `api-stage.rampme.site` hostname, and the manual OpenTofu step from group 8; also updated `Home`'s topology overview and request-path diagram

## 10. End-to-end verification

- [x] 10.1 With `backend-stage` and `hw-sim` both deployed and `api-stage.rampme.site` reachable, manually create a ramp reservation against the stage backend and confirm the full `pending -> active -> done` sequence completes using hw-sim's default profile. Backend logs confirmed the full `deploying`/`deployed`/`done` sequence arrived and the DB updated correctly; the UI itself appeared to hang at `active` because `handleHardwareState()` never pushed an SSE update on `done` (or `error`) — fixed in this same PR (see the `bridge.ts` diff). Worth a clean re-run once this merges to confirm the UI now reflects it too.
- [ ] 10.2 Switch a vehicle's hw-sim profile to `no-ack` via its control endpoint and confirm a reservation against that vehicle expires after `DEPLOY_TIMEOUT_MS`, exercising the timeout path this change was built to make testable. Deferred to [#65](https://github.com/rangelovkiril/rampme-software/issues/65): a one-off manual check isn't a durable regression guard for exactly the path `hw-sim` exists to make testable, so it's folded into a broader test-stack overhaul (automated coverage for this plus the ramp reservation lifecycle) instead of run by hand once here.
- [x] 10.3 Load the frontend from `https://staging.rampme.pages.dev` and confirm (via browser devtools network tab) that API calls go to `api-stage.rampme.site`, not `api.rampme.site`. No browser available in this session (Playwright needs system Chrome, which needs `sudo`); verified equivalently by fetching the deployed JS bundle directly and confirming the compiled `resolveApiBase()` logic and both hostnames are present and correctly paired. A literal devtools Network-tab check is still worth doing once someone has a browser handy.
