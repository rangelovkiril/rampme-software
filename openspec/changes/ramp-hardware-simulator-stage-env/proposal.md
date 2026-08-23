## Why

`MOCK_RAMP` is documented in `backend/AGENTS.md`, `README.md`, and `.github/README.bg.md` as a way to simulate ramp hardware, but `config.mockRamp` is never read anywhere outside its own definition — the flag does nothing. Separately, "staging" does not isolate anything today: the backend CI job tags a `stage-<timestamp>` image that no `fleet` `ImagePolicy` ever deploys, and the frontend's `deploy-staging` job bakes `NEXT_PUBLIC_API_URL: https://api.rampme.site` — production — into the staging build, so the staging preview silently exercises the real backend, real reservation data, and the real ramp MQTT path to physical hardware. There is currently no way to exercise the ramp reservation-to-deploy flow, including hardware failure and timeout paths, without either real hardware or touching production.

## What Changes

- Add a standalone `hw-sim` app: an in-process MQTT broker plus a per-vehicle ramp hardware state machine that speaks the documented ramp MQTT protocol (`ramp/{vehicle_id}/cmd` / `ramp/{vehicle_id}/state`), with an HTTP control endpoint to switch a vehicle's response profile (happy path, no-ack timeout, error) without restarting the process.
- Add a permanent, isolated `backend-stage` deployment (own `RAMP_DB_PATH` volume, own image policy watching the already-produced `stage-*` tags) that points its `MQTT_URL` at `hw-sim` instead of the production HiveMQ broker, reachable at its own public hostname.
- Change the frontend's backend-selection logic from a single build-time-baked `NEXT_PUBLIC_API_URL` to a runtime hostname lookup: `rampme.site` resolves to the production API, `staging.rampme.pages.dev` resolves to the stage API, and any other hostname (PR previews, a locally served static export, anything unrecognized) falls back to the stage API rather than production — a fail-safe default given the backend can trigger a physical hardware action. An explicitly set `NEXT_PUBLIC_API_URL` still wins, preserving local dev's existing behavior; local dev (`next dev`) is additionally exempted via its own `NODE_ENV` check, so it keeps using the `/api` rewrite proxy rather than reaching this lookup at all. The frontend CI workflow's `deploy-staging` job no longer bakes the production `NEXT_PUBLIC_API_URL` into the staging build — one build artifact now serves every environment.
- **BREAKING**: remove the dead `MOCK_RAMP` env var and its (already-inaccurate) documentation in `backend/AGENTS.md`, `README.md`, and `.github/README.bg.md`.

## Capabilities

### New Capabilities
- `ramp/hardware-simulator`: a standalone service that responds to the ramp MQTT protocol as physical hardware would, with a scriptable per-vehicle response profile, so the reservation lifecycle (including timeout/error paths) can be exercised without real hardware or a second managed broker.
- `frontend/environment-api-resolution`: the frontend resolves which backend to call at runtime from its own hostname, with an unrecognized-origin fallback that defaults to the non-production backend.

### Modified Capabilities
(none — no existing `openspec/specs/` capability's requirements change; `realtime-sse` is unaffected)

## Impact

- New top-level app directory (name TBD in design.md, e.g. `hw-sim/`), sibling to `backend/` and `frontend/`, with its own `package.json`, Dockerfile, and `AGENTS.md`/`CLAUDE.md` symlink per the root `AGENTS.md` app-listing convention (`AGENTS.md`'s "This repo... holds both apps: `backend/` and `frontend/`" line needs updating to three).
- New `.github/workflows/<hw-sim>.yaml`, mirroring `.github/workflows/backend.yaml`'s `check` + `build-image` jobs, without a `promote` job.
- `backend/src/config/index.ts` (remove `mockRamp`), `backend/AGENTS.md`, `README.md`, `.github/README.bg.md` (remove the `MOCK_RAMP` documentation).
- `frontend/src/lib/config.ts` (`apiPath()` / API base resolution) — new hostname lookup, sourced from and cross-referenced with the CORS origin allowlist in `backend/src/index.ts`'s `cors({ origin: [...] })`. `frontend/AGENTS.md`'s `NEXT_PUBLIC_API_URL` row needs updating to describe the new precedence (explicit env var, then hostname lookup, then stage fallback).
- Cross-repo, out of this store: `fleet` (`apps/rampme/backend/` restructured into a Kustomize `base/` + `overlays/{production,stage}/` so the two environments' `Deployment`/`Service`/etc. share their common shape instead of being duplicated; a new `apps/rampme/hw-sim/`; `infrastructure/configs/envoy-gateway/gateway.yaml` needs a second listener for the stage hostname; `tofu/tunnel.tf` and `tofu/dns.tf` need a new ingress rule and DNS record, applied by hand per that repo's OpenTofu convention). Tracked here as impact, implemented as a separate PR in that repository.
- Documentation sync: the [Ramp MQTT Protocol wiki page](https://github.com/rangelovkiril/rampme-software/wiki/Ramp-MQTT-Protocol) gains a reference to `hw-sim` as its executable counterpart; the [fleet wiki](https://github.com/rangelovkiril/fleet/wiki) infrastructure runbook gains the stage environment and its hostname.
