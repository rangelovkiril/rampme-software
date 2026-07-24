# Plan: Frontend → Cloudflare Pages (static), backend stays in k3s; SSE fixes; backend perf + bug fixes

Two repos are involved:

- `~/projects/rampme-software` — app code (this repo): `backend/` (Elysia on Bun, compiled binary) and `frontend/` (Next.js 16, fully client-side).
- `~/projects/fleet` — Flux GitOps repo for the k3s cluster. App manifests live in `apps/rampme/`.

Target architecture:

- `rampme.site` → **Cloudflare Pages** serving the static export of the frontend. No frontend container, Deployment, Service, or HTTPRoute in the cluster at all.
- `api.rampme.site` → Cloudflare Tunnel → Envoy Gateway → `rampme-backend` Service. The backend keeps its current paths (`/stops`, `/realtime/...`, `/ramp/...`) — **no `/api` prefix, no URLRewrite**.
- Frontend calls the API cross-origin via a build-time base URL; backend CORS is configured accordingly.

Current traffic path (for orientation): Cloudflare edge → Cloudflare Tunnel (`cloudflared` Deployment in `infrastructure/controllers/cloudflared/`, remotely-managed config — ingress hostname mappings live in the Cloudflare dashboard/API, NOT in the repo) → Gateway `eg` in `envoy-gateway-system`, listener `rampme-site` (HTTP :80, hostname `rampme.site`, defined in `infrastructure/configs/envoy-gateway/gateway.yaml`) → HTTPRoute `rampme-frontend` → Next.js pod, which currently proxies `/api/*` to the backend.

Pre-verified facts (do not re-litigate, but sanity-check as you go):

- The frontend has **zero** server-side features: no middleware, no server actions, no `next/image`, no `next/headers`/`cookies()`, no `next/font`, single page (`app/page.tsx` is `'use client'` with `dynamic(..., {ssr:false})`). All data fetching is client-side against relative `/api/*` URLs. `manifest.ts` / `icon.tsx` / `apple-icon.tsx` are build-time metadata files. Static export is safe.
- The only server piece is the catch-all proxy `frontend/app/api/[...path]/route.ts` — it gets deleted; Envoy + absolute API base replace it.
- Backend is already pure Bun. SSE (`backend/src/services/sse.ts`) uses web-standard `ReadableStream`; `node:events` in `gtfs/realtime.ts` runs natively under Bun. Do NOT rewrite SSE to WebSockets.
- Frontend fetch call sites (all currently hardcoded `/api/...`): `contexts/RampContext.tsx` (3 calls), `components/layers/VehiclesLayer.tsx`, `components/ui/FloatingNav.tsx`, `components/sheets/VehicleTripSheet.tsx`, `components/sheets/StopArrivalsSheet.tsx`, plus `hooks/useSSE.ts` URL resolution and any others found by `grep -rn "'/api\|\"/api\|\`/api" frontend --include='*.ts*'`.
- Cloudflare-side actions (Pages project, custom domain, tunnel hostname) are marked **[CF — user]**: the user wants to do these via the Cloudflare dashboard/API themselves. Prepare everything so those are the only manual steps, and print exact instructions (or `wrangler` commands) for them when you get there.

Work in phases, in order. Each phase must build/pass checks before moving on. Backend and frontend both use `bun run check` (biome + tsc).

---

## Phase 1 — fleet: give the backend its own hostname

1. `infrastructure/configs/envoy-gateway/gateway.yaml`: add a second listener:

```yaml
    - name: rampme-api
      protocol: HTTP
      port: 80
      hostname: api.rampme.site
      allowedRoutes:
        namespaces:
          from: All
```

2. New file `apps/rampme/backend/httproute.yaml` (+ add to `apps/rampme/backend/kustomization.yaml`):

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: rampme-backend
  namespace: rampme
spec:
  parentRefs:
    - name: eg
      namespace: envoy-gateway-system
      sectionName: rampme-api
  hostnames:
    - api.rampme.site
  rules:
    - timeouts:
        request: 0s
      backendRefs:
        - name: rampme-backend
          port: 3000
```

`timeouts.request: 0s` disables Envoy's default 15s route timeout, which otherwise kills every SSE stream at the 15s mark.

3. **[CF — user]** Add a public hostname to the tunnel: `api.rampme.site` → the same service the tunnel already targets for `rampme.site` (the Envoy Gateway service in `envoy-gateway-system`; check the existing `rampme.site` entry in Zero Trust → Tunnels and mirror it). Via API: `PUT /accounts/{account_id}/cfd_tunnel/{tunnel_id}/configurations` adding an ingress entry, plus a proxied CNAME `api` → `<tunnel-id>.cfargotunnel.com`.

4. Do NOT touch the existing frontend HTTPRoute/Deployment yet — the site keeps working through the old path until Phase 2 is deployed.

Verification (after Flux reconciles and the tunnel hostname exists):

- `curl -s https://api.rampme.site/health` → `Ok`.
- `curl -sN https://api.rampme.site/realtime/vehicles/stream | head -c 200` → SSE `data:` frames.
- `timeout 40 curl -sN https://api.rampme.site/realtime/vehicles/stream >/dev/null; echo $?` → `124` (stream outlived 15s; killed by `timeout`, not Envoy).

## Phase 2 — frontend: static export + Cloudflare Pages

### 2.1 Code changes (`rampme-software/frontend/`)

1. Delete `app/api/[...path]/route.ts` (and the empty `app/api/` dir).

2. New `lib/api.ts`:

```ts
export const API_BASE = (process.env.NEXT_PUBLIC_API_URL ?? '/api').replace(/\/+$/, '')

export function apiUrl(path: string): string {
  return `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`
}
```

`NEXT_PUBLIC_API_URL` is inlined at build time. Production (Pages) builds set it to `https://api.rampme.site`; dev builds leave it unset and fall back to `/api` + dev rewrites.

3. Replace every hardcoded `/api/...` call site with `apiUrl('/...')` — note the paths lose their `/api` prefix (`fetch('/api/stops')` → `fetch(apiUrl('/stops'))`), since the backend serves them at root. Update `hooks/useSSE.ts` to resolve via `apiUrl` as well (drop `resolveSseUrl` and the `NEXT_PUBLIC_BACKEND_URL` handling; call sites already pass `/realtime/...`-style paths).

4. `next.config.ts`:

```ts
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: false,
  output: 'export',
  // Dev-only: proxies /api/* to a local backend, replacing the deleted proxy
  // route. Ignored by `next build` (NODE_ENV=production), so it never
  // conflicts with output:'export'.
  ...(process.env.NODE_ENV === 'development' && {
    rewrites: async () => [
      {
        source: '/api/:path*',
        destination: `${process.env.BACKEND_URL ?? 'http://localhost:3000'}/:path*`,
      },
    ],
  }),
}

export default nextConfig
```

5. `app/layout.tsx`: change `manifest: '/manifest.json'` → `manifest: '/manifest.webmanifest'` (the path `manifest.ts` actually generates; the current link 404s).

6. New file `public/_headers` (Cloudflare Pages honors it; `public/` is copied into `out/`):

```
/_next/static/*
  Cache-Control: public, max-age=31536000, immutable
```

7. **Delete `frontend/Dockerfile`.** There is no frontend image anymore.

8. Run `bun run build`; verify `out/` contains `index.html`, `_next/static/**`, `manifest.webmanifest`, `_headers`, and the generated `icon`/`apple-icon` PNG routes. If the build errors on the icon routes, add `export const dynamic = 'force-static'` to `icon.tsx`/`apple-icon.tsx`.

9. Update `frontend/claude.md` if it documents the proxy route, Docker, or `next start`.

### 2.2 Backend CORS (`rampme-software/backend/src/index.ts`)

The frontend now calls cross-origin with `Content-Type: application/json` and `X-Session-Id` headers (both trigger preflight). Replace the bare `.use(cors())` with an explicit config:

```ts
cors({
  origin: [
    'https://rampme.site',
    /^https:\/\/[\w-]+\.rampme\.pages\.dev$/, // Pages preview deployments
    /^http:\/\/localhost:\d+$/,               // local dev without the rewrite proxy
  ],
  methods: ['GET', 'POST', 'DELETE'],
  allowedHeaders: ['Content-Type', 'X-Session-Id'],
})
```

Adjust the preview-domain regex to the actual Pages project name chosen in 2.4. (EventSource sends no custom headers, so SSE needs only the origin allowance.)

### 2.3 CI — DONE, do not rework

CI is already split into two standalone workflows; treat them as the settled design:

- `.github/workflows/frontend.yaml`: check + build (bakes `NEXT_PUBLIC_API_URL=https://api.rampme.site`) + artifact upload on every PR/push; on main-push the same artifact deploys to Pages `--branch staging` then `--branch main` (environments `staging`/`production`, `cloudflare/wrangler-action@v3` with `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID` secrets).
- `.github/workflows/backend.yaml`: check on PR; on main-push builds/pushes `sha-<commit>` + `stage-<ts>`, then promotes `sha-<commit>` → `prod-<ts>` via `imagetools create`. Flux ImagePolicy requires the numeric-sortable `prod-<timestamp>` format — keep it.
- Native `on.*.paths` filtering replaced `dorny/paths-filter` + matrix; the composite actions under `.github/actions/` were inlined and deleted. Do not reintroduce either.
- The frontend uses build-time `NEXT_PUBLIC_API_URL` (see `lib/config.ts` / `apiPath`); the earlier runtime `/config.json` mechanism was removed on purpose — there is one backend, so one artifact serves both environments.

### 2.4 Cloudflare Pages project

**[CF — user]**, with exact commands provided by the executor at this step:

1. Create the Pages project (Direct Upload type): `wrangler pages project create <project> --production-branch main`.
2. First deploy (can come from CI or a local `wrangler pages deploy out ...`).
3. Add custom domain `rampme.site` to the project (dashboard or API `POST /accounts/{account_id}/pages/projects/{project}/domains`). This repoints the `rampme.site` DNS record to Pages — from that moment the cluster frontend stops receiving traffic.
4. Remove the old `rampme.site` public-hostname entry from the tunnel config.

SPA fallback: with no `404.html` in the output, Pages serves `index.html` for unknown paths automatically — nothing to configure; the app is single-page anyway.

### 2.5 fleet cleanup (only after 2.4 is live and verified)

- Delete `apps/rampme/frontend/` entirely (deployment, service, httproute, imagepolicy, imagerepository, kustomization).
- Remove the `frontend` entry from `apps/rampme/kustomization.yaml`.
- Check `apps/rampme/imageupdateautomation.yaml` — if it references the frontend image policy/repository, remove those references; the automation itself stays for the backend.
- Optionally remove the now-unused `rampme-site` frontend listener? **No** — `rampme.site` no longer reaches the cluster at all, so the listener is dead config; remove listener `rampme-site` from `gateway.yaml`, keep `rampme-api`.

Verification:

- `https://rampme.site` loads from Pages (check `cf-ray` / no k8s pod logs), map renders, vehicles stream live, ramp reservation round-trips (POST → 200, appears in session list).
- Browser devtools: no CORS errors; preflight (`OPTIONS`) on `/ramp/reserve` returns the expected `access-control-allow-*` headers.
- `kubectl get pods -n rampme` shows only the backend.

## Phase 3 — backend: perf fixes

All in `rampme-software/backend/`.

### 3.1 Single refresh tick

`src/gtfs/realtime.ts`: remove the second `setInterval` (the one that only emits `refresh`). Emit `realtimeEvents.emit('refresh')` at the end of a **successful** `refreshFeeds()` (at least one feed updated). Removes up to 5s of staleness between fetch and push.

### 3.2 Kill the per-client, per-tick recompute

Today every SSE client runs `buildEnrichedVehicles()` (full feed enrichment + one SQLite query per ramp-equipped vehicle) on every tick. Fix in two parts:

1. **Batch the reservations query.** In `src/gtfs/enrich.ts`, change `enrichVehicles` to accept a prebuilt `Map<string /*vehicle_id*/, RampReservation[]>` built once per call from `getAllActiveReservations()` (statement already exists in `db/ramp.ts`), instead of calling `getVehicleRampInfo` per vehicle. Refactor `services/ramp/status.ts` to derive status from an already-fetched array (e.g. `getVehicleRampInfoFrom(reservations)`).
2. **Memoize per tick.** In `src/routes/realtime.ts`, cache the *unfiltered* `buildEnrichedVehicles({})` result for the current tick (module-level `{ tick, vehicles }`; increment `tick` on each `refresh` event, subscribed once at module load). Filtered requests (`route_id`, `route_type`, `has_ramp`) filter the cached array. SSE `getData` closures become O(filter) instead of O(full enrichment).

Do not cache across ticks; do not cache JSON strings per filter combo.

### 3.3 Precompute static GTFS indexes

In `src/gtfs/static.ts` (and `types.ts`), build while loading:

- `tripsByRoute: Map<string, Trip[]>`
- `stopIdsByRoute: Map<string, Set<string>>`

Use them in `src/routes/transit.ts` `/routes/:id` (currently full-scans `trips` + `stopTimes` per request).

### 3.4 Cache `/stops` per service day

`src/routes/stops.ts` `GET /stops` scans all of `stopTimesByStop` per request. Cache the response keyed by `todayDateStr()` + GtfsData object identity (module-level `{ dateStr, data, result }`), invalidate when either changes.

## Phase 4 — bug fixes

### 4.1 Midnight ETA wrap in arrivals (`src/services/transit/arrivals.ts`)

The schedule fallback computes `eta_minutes = Math.max(0, totalMinutes - currentMinutes)` — a 00:10 arrival viewed at 23:55 yields 0 ("arriving now"). Reuse the wrap logic already in `trip-details.ts` (`computeScheduledEtaMinutes`): move it to a shared location (e.g. `src/gtfs/time.ts`), use it in both places. When it returns `null` (stop passed), drop that arrival from results instead of showing eta 0.

### 4.2 After-midnight services missing (`arrivals.ts` + `src/gtfs/services.ts`)

GTFS times ≥ 24:00 belong to the *previous* service day. In `collectScheduledArrivals`: compute `yesterdayServices = activeServiceIds(data.calendarDates, new Date(now.getTime() - 86400_000))`; for trips in `yesterdayServices`, include stop_times whose time-in-minutes ≥ `currentMinutes + 1440`. Display still goes through `normalizeGtfsHour`, ETA through the shared helper from 4.1. If the diff turns invasive, restructure `collectScheduledArrivals` to compare minutes rather than strings throughout.

### 4.3 SSE resilience across backend restarts

- Backend `src/services/sse.ts`: on stream start, enqueue `retry: 3000\n\n` before the first data frame; add a heartbeat `: hb\n\n` every 20s (interval started in `start()`, cleared in `cancel()`, handle stored alongside `send`). The heartbeat also keeps the Cloudflare edge (100s idle cutoff) and the tunnel from reaping quiet streams — relevant for the per-vehicle ETA streams, which can go quiet.
- Frontend `hooks/useSSE.ts`: browsers treat non-200 SSE responses (e.g. 502 while the backend pod restarts) as **fatal** and stop reconnecting. Rework: wrap EventSource creation in `connect()`; on `es.onerror` with `es.readyState === EventSource.CLOSED`, close and re-`connect()` after backoff (2s start, double to 30s max, reset on message). Clean up EventSource + pending timer on unmount/url change. Public API (`useSSE<T>(url): T | null`) unchanged.

### 4.4 `deployAcknowledged` leak (`src/services/ramp/bridge.ts`)

If hardware sends `deploying` but never `done`/`error`/`idle`, the ack flag lives forever and future deploys never get a timeout. Fix: delete the vehicle from `deployAcknowledged` inside `clearDeployTrigger()`. Verify no call site relies on ack surviving `clearDeployTrigger`.

### 4.5 Phantom dependency

`backend/package.json`: add `@sinclair/typebox` to `dependencies` (imported in `src/services/ramp/bridge.ts`, currently only transitive via Elysia). Match Elysia's shipped major (`bun pm ls | grep typebox`) to avoid dual instances.

## Phase 5 — final verification

1. `cd backend && bun run check` and `cd frontend && bun run check` — clean.
2. Backend locally: `bun run dev` without MQTT_URL (starts, logs the skip), hit `/health`, `/stops`, `/realtime/vehicles`; `curl -N localhost:3000/realtime/vehicles/stream` for >25s — expect `retry:`, heartbeat comments, data frames.
3. Frontend dev: `bun run dev` + local backend — map loads, vehicles stream, no console errors. Kill the backend for 10s, restart, confirm the stream recovers without a page reload (tests 4.3).
4. Commit per phase (conventional commits, matching existing history). Backend images still flow through CI → Flux image automation; do not hand-edit image tags in fleet (`# {"$imagepolicy": ...}` markers are Flux-managed).
5. After prod rollout: re-run Phase 1 curls against `api.rampme.site`, plus a >120s SSE longevity check through Cloudflare (exercises the 100s idle path with heartbeats), and the Phase 2.5 checks (Pages serving, CORS clean, only backend pod in the namespace).

## Out of scope (explicitly)

- No WebSocket migration, no framework swap (Next stays as the build tool).
- No changes to MQTT topics/protocol or hardware contract; no SQLite schema changes.
- `RampContext`'s 5s polling stays as is (later cleanup candidate).
- Cloudflare account actions (Pages project, custom domain, tunnel hostnames, API token) are executed by the user — the plan only prepares and prints exact commands.
