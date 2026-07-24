# RampMe

## What is this

Live public transport map for Sofia. Shows vehicles, stops, routes, and real-time arrival predictions. Core feature: wheelchair ramp reservation — a rider near a stop requests a ramp, and an embedded hardware module on the vehicle deploys it via MQTT when the vehicle arrives.

Two apps in this repo, deployed independently:

- **`backend/`** — Bun + Elysia REST/SSE API. Deployed as a container in k3s (GitOps via `~/projects/fleet`), reachable at `api.rampme.site`.
- **`frontend/`** — Next.js 16 (App Router), fully client-side, static-exported (`output: 'export'`). Deployed to Cloudflare Pages, reachable at `rampme.site`. No server, no runtime config fetch — the backend base URL is baked in at build time.

The two communicate cross-origin: the frontend calls `https://api.rampme.site/...` directly (CORS-enabled on the backend), plus Server-Sent Events for live vehicle/ETA streams.

## Backend (`backend/`)

**Stack:** Bun + Elysia + SQLite (`bun:sqlite`) + protobufjs (GTFS-RT decoding) + `mqtt` (ramp hardware) + `@sinclair/typebox` (schema validation) + `consola` (logging).

```
src/
  index.ts                    Entry point — wires plugins/routes, starts server, boots MQTT + proximity checker
  config/index.ts             All env-based configuration in one place
  config/swagger.ts           OpenAPI/Swagger plugin setup

  routes/                     HTTP handlers — thin, no business logic
    stops.ts                  /stops, /stops/:id, /stops/:id/vehicles(/stream)
    transit.ts                /routes, /routes/:id, /routes/shapes
    realtime.ts               /realtime/vehicles(/stream), /realtime/vehicles/:id/trip(/etas), /realtime/trip-updates
    ramp.ts                   /ramp/reserve, /ramp/reserve/:id, /ramp/session, /ramp/vehicle/:id

  services/
    state.ts                  Shared GTFS data holder (getGtfs/setGtfs) + jsonError helper
    sse.ts                    makeSseStream() — SSE response w/ retry hint + 20s heartbeat
    mqtt.ts                   MQTTHub — pattern-based subscriptions with per-handler parsers, publish helper
    transit/
      arrivals.ts             Upcoming arrivals at a stop (schedule + RT merge, sibling stops, after-midnight services)
      trip-details.ts         Trip stop list with RT predictions for a vehicle (getVehicleTripDetails, getTripEtas)
    ramp/
      bridge.ts                Reservations ↔ hardware over MQTT (publish cmd, handle hw state, deploy timeout)
      proximity.ts             GPS proximity checker — triggers deploy when a ramp-reserved vehicle nears its stop
      status.ts                Ramp status/reservations shaping for enrichment (getReservationsByVehicle, getVehicleRampInfoFrom)

  gtfs/                       GTFS data layer
    types.ts                  All GTFS + GTFS-RT data interfaces (Stop, Route, Trip, GtfsData, GtfsRt*)
    static.ts                 Fetches & parses the GTFS ZIP into in-memory Maps + precomputed indexes
    realtime.ts               Fetches/decodes GTFS-RT protobuf feeds, single refresh tick, emits 'refresh' for SSE
    services.ts               activeServiceIds() — active service_ids for a given calendar date
    time.ts                   GTFS time parsing/formatting + computeScheduledEtaMinutes (shared midnight-wrap logic)
    enrich.ts                 enrichVehicles() — merges RT vehicle positions with static data + ramp status

  db/
    ramp.ts                   SQLite access for ramp reservations (create/cancel/status, session + vehicle queries)

proto/
  gtfs-realtime.proto          Minimal GTFS-RT proto (FeedMessage, TripUpdate, VehiclePosition, ...)
```

### Key concepts

- **GTFS static data** is fetched once on startup (and refreshed on `GTFS_REFRESH_INTERVAL`) as a ZIP, parsed into `GtfsData` — Maps for fast lookup by ID, plus precomputed `tripsByRoute` / `stopIdsByRoute` indexes.
- **GTFS-RT** (vehicle-positions, trip-updates) is fetched on a single background tick (`REFRESH_INTERVAL_MS` in `gtfs/realtime.ts`); a `refresh` event fires once per successful fetch, driving SSE pushes and a per-tick enriched-vehicle cache in `routes/realtime.ts` (memoized so N clients don't each recompute enrichment).
- **GTFS-RT typing** — decoded protobuf JSON is typed via `GtfsRt*` interfaces in `gtfs/types.ts` (camelCase field names, matching `proto/gtfs-realtime.proto`); a single type assertion at the `FeedMessage.decode().toJSON()` boundary is the only place the wire format is untyped.
- **Sibling stops** — Sofia's GTFS has separate stop_ids for bus/tram/trolley at the same physical stop (e.g. `A2795`, `TB2795`), sharing a `stop_code`. Arrivals are queried across all siblings together.
- **GTFS 24+ hour times** — GTFS allows times like `25:30:00` for post-midnight trips on the *same* service day, and separately, yesterday's active service can have stop_times ≥24:00 that land on *today*. `gtfs/time.ts` (`computeScheduledEtaMinutes`, `normalizeGtfsHour`) and `services/transit/arrivals.ts` (`collectScheduledArrivals`) both handle this.
- **Ramp reservations** are SQLite rows (`db/ramp.ts`) with a `pending → active → done` (or `cancelled`/`expired`) lifecycle. `services/ramp/bridge.ts` mirrors state to/from hardware over MQTT topics `ramp/{vehicle_id}/cmd` and `ramp/{vehicle_id}/state`; `services/ramp/proximity.ts` triggers the deploy command via GPS distance to the reserved stop.
- **SSE** (`services/sse.ts`) sends a `retry: 3000` hint and a `: hb` heartbeat every 20s so Cloudflare's edge / the tunnel don't reap idle streams (100s idle cutoff).
- **MQTT payload validation** uses TypeBox (`@sinclair/typebox` + `Value.Check`) at the point untrusted hardware input enters the system (`HardwareStateSchema` in `bridge.ts`) — this is the pattern to follow for any new untrusted-input parsing. Internally decoded, structurally-guaranteed data (GTFS-RT) uses plain TS interfaces instead; don't add TypeBox validation to hot per-tick paths.
- **Logging** goes through `consola` (`import { consola } from 'consola'`), tagged per subsystem via `consola.withTag('mqtt' | 'ramp-mqtt' | 'proximity')`. No bare `console.*` calls.

### Rules

- **Route handlers stay thin.** Parse input, validate, call a service function, return result or error.
- **Business logic goes in `services/`.** Pure-ish functions that take `GtfsData` (+ params) and return results — testable without HTTP.
- **Shared types go in `gtfs/types.ts`.** Don't define GTFS or GTFS-RT interfaces elsewhere.
- **Time helpers go in `gtfs/time.ts`.** Don't inline `split(':').map(Number)` or `h % 24` — use `parseGtfsTime()`, `normalizeGtfsHour()`, `computeScheduledEtaMinutes()`.
- **Config goes in `config/index.ts`.** No hardcoded env-driven flags in handler files.
- **No `any`.** GTFS-RT decode shapes are typed via `gtfs/types.ts`; untrusted external input (MQTT, request bodies) gets a TypeBox schema + runtime check.
- **Logging goes through `consola`**, not `console.*` — tag per subsystem, pick the level that matches severity (`.error` for actual failures, `.warn` for degraded-but-running, `.info`/`.success` for routine events).
- **Don't add JSDoc that restates the obvious.** Only document non-obvious behavior (edge cases, GTFS quirks, hardware protocol subtleties).

### Running

```bash
cd backend
bun install
bun run dev          # watch mode
bun run check        # biome + tsc
bun run proto        # regenerate src/gtfs/gtfs-realtime.json after editing proto/gtfs-realtime.proto
```

### Environment variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Server port |
| `GTFS_STATIC_URL` | Sofia Traffic API | GTFS static ZIP URL |
| `GTFS_RT_BASE_URL` | Sofia Traffic API | GTFS-RT base URL |
| `GTFS_REFRESH_INTERVAL` | 86400000 (24h) | Static data refresh interval (ms) |
| `PROTO_PATH` | `proto/gtfs-realtime.proto` | Protobuf definition path |
| `RAMP_DB_PATH` | `./data/ramp.db` | SQLite path for ramp reservations |
| `MOCK_RAMP` | `false` | Mock ramp hardware responses (testing) |
| `MQTT_URL` | _(unset)_ | MQTT broker URL; if unset, MQTT/ramp hardware integration is skipped entirely |
| `MQTT_USERNAME` / `MQTT_PASSWORD` | _(unset)_ | MQTT broker credentials |
| `MQTT_CLIENT_ID` | `rampme-backend` | MQTT client ID |
| `DEPLOY_TIMEOUT_MS` | `20000` | How long to wait for hardware "deploying" ack before expiring a reservation |

## Frontend (`frontend/`)

**Stack:** Next.js 16 (App Router) + React 19 + Leaflet (`react-leaflet`) + Tailwind CSS 4.

```
app/
  layout.tsx                  Root layout — dark mode script, Leaflet CSS import
  page.tsx                    Single page, dynamically imports Map (SSR disabled for Leaflet)
  manifest.ts / icon.tsx / apple-icon.tsx   Build-time metadata routes (force-static)

components/
  Map.tsx                     Orchestrator — holds all app state, composes everything below
  MissedBusAlert.tsx          Toast shown when a ramp-reserved vehicle departs without the ramp being used

  layers/                     Leaflet map layers (use useMap(), render nothing to DOM)
    StopsLayer.tsx            Stop markers, click to select
    VehiclesLayer.tsx         Vehicle markers (circles at low zoom, detailed icons at high zoom)
    RouteLinesLayer.tsx       Polyline overlay for selected route
    LiveLocation.tsx          User's GPS position with accuracy circle

  sheets/                     Bottom sheets (slide-up panels)
    StopArrivalsSheet.tsx     Arrivals at selected stop, ramp request button, mobile drag-to-resize
    VehicleTripSheet.tsx      Trip timeline for selected vehicle with stop-by-stop predictions

  panels/                     Side panel sub-panels (inside SidePanel shell)
    RoutesPanel.tsx           Route list with search + type filter chips
    StopsPanel.tsx            Stop list with search
    ReservationsPanel.tsx     Active/past ramp reservations for the current session
    FilterChip.tsx            Reusable filter chip component

  ui/                         Standalone UI controls (positioned outside MapContainer)
    MapControls.tsx           Zoom, theme toggle, location tracking buttons
    FloatingNav.tsx           Top navigation pills (Routes/Stops/Reservations)
    NavBtn.tsx                Shared nav pill button
    ResBanner.tsx             Compact banner for an active ramp reservation
    ResDetailCard.tsx         Expanded reservation detail card

  SidePanel.tsx               Thin shell — handles open/close, renders active sub-panel

contexts/
  RampContext.tsx             Ramp reservation state — session id, create/cancel, 5s polling of /ramp/session, missed-bus alert

hooks/
  useSSE.ts                   Generic SSE hook with reconnect-with-backoff (2s→30s) on a closed connection

lib/
  types.ts                    Shared TypeScript interfaces (Stop, Vehicle, StopArrival, TripData, etc.)
  transit.ts                  Route type config (colors, labels), getRouteColor(), formatEta()
  config.ts                   apiPath() — build-time backend base URL (NEXT_PUBLIC_API_URL)
```

### Key concepts

- **All Leaflet interaction happens in `layers/`.** These components use `useMap()` and return `null`. They manage `L.LayerGroup` refs internally and sync data via props.
- **Viewport culling** — StopsLayer and VehiclesLayer only render markers within `map.getBounds()`. They listen to `zoomend`/`moveend` via a `revision` counter.
- **Sibling stops** — when selecting a stop, the backend returns arrivals for all physical siblings (bus + tram + trolley variants at the same location).
- **Theming** — CSS variables in `globals.css`, toggled via `dark` class on `<html>`. No Tailwind `dark:` prefix — CSS vars directly in `style` props for dynamic values.
- **Static export, build-time API base** — `next.config.ts` sets `output: 'export'`; the app is fully client-side, no server. `lib/config.ts`'s `apiPath()` resolves against `NEXT_PUBLIC_API_URL`, inlined at build time (CI bakes in `https://api.rampme.site`). Local dev leaves it unset, falling back to `/api` + the dev-only `rewrites()` proxy in `next.config.ts` (→ `BACKEND_URL`, default `http://localhost:3000`). One build artifact serves every environment — there's no runtime config fetch.
- **Realtime data** comes from SSE (`useSSE`) for vehicle positions and per-trip ETAs; ramp reservations still use 5s polling in `RampContext` (a known/accepted cleanup candidate, not SSE yet).
- **SSE reconnect** — browsers can treat a non-200 SSE response as fatal and stop retrying. `useSSE` wraps `EventSource` creation so that on a `CLOSED`-state error it manually reconnects with backoff (2s → 30s, reset on message); native browser auto-retry (for a connection that drops after being established) still handles the common case on its own.

### Rules

- **Types go in `lib/types.ts`.** Don't define `Stop`, `Vehicle`, etc. inside component files.
- **Route colors/labels come from `lib/transit.ts`.** Don't hardcode color maps in components — use `getRouteColor()`.
- **Layers don't render DOM elements.** They return `null` and manipulate Leaflet directly via refs.
- **Sheets and panels own their data fetching.** They fetch on mount/prop change and manage their own loading/error state.
- **Keep Map.tsx as a wiring layer.** State + callbacks + composition. No inline fetch logic or complex JSX.
- **Inline `style` props for CSS variable values.** Tailwind for layout/spacing, `style={{ color: 'var(--text)' }}` for theme-dependent values that can't be Tailwind classes.
- **No excessive JSDoc.** Component names and prop types should be self-documenting.
- **Mobile responsiveness** — sheets use `max-sm:` breakpoints. StopArrivalsSheet has drag-to-resize on mobile. Test both viewports.
- **API calls go through `apiPath()`** (`lib/config.ts`), never a hardcoded `/api/...` or absolute URL.

### Running

```bash
cd frontend
bun install
bun run dev          # Next.js dev server (proxies /api/* to BACKEND_URL)
bun run check        # biome + tsc
bun run build        # static export → out/
```

### Environment variables

| Variable | Default | Description |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | _(unset → `/api`)_ | Build-time backend base URL. CI sets this to `https://api.rampme.site`; local dev leaves it unset. |
| `BACKEND_URL` | `http://localhost:3000` | Dev-only backend URL, used by the `next.config.ts` rewrite proxy (only active when `NEXT_PUBLIC_API_URL` is unset). |

## Infrastructure

- Backend runs in k3s, GitOps-managed from `~/projects/fleet` (`apps/rampme/backend/`). Exposed via Envoy Gateway + a Cloudflare Tunnel at `api.rampme.site`. CORS on the backend allow-lists `https://rampme.site`, Cloudflare Pages preview domains, and `http://localhost:*`.
- Frontend deploys to Cloudflare Pages (Direct Upload) from `.github/workflows/frontend.yaml`; `.github/workflows/backend.yaml` builds/pushes the backend image and promotes it through Flux image automation. There is no frontend Deployment/Service/HTTPRoute in the cluster.
