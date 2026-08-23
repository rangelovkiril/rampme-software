# Frontend

Next.js 16 (App Router), fully client-side, static-exported. Read the root [`AGENTS.md`](../AGENTS.md) first for the project overview and the cross-cutting working rules (docs sync, tooling, `bun run check`, no `any`, commits). This file covers frontend-specific structure and rules.

**Stack:** Next.js 16 (App Router) + React 19 + Leaflet (`react-leaflet`) + Tailwind CSS 4.

```
app/
  layout.tsx                  Root layout - dark mode script, Leaflet CSS import
  page.tsx                    Single page, dynamically imports Map (SSR disabled for Leaflet)
  manifest.ts / icon.tsx / apple-icon.tsx   Build-time metadata routes (force-static)

components/
  Map.tsx                     Orchestrator - holds all app state, composes everything below
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

  SidePanel.tsx               Thin shell - handles open/close, renders active sub-panel

contexts/
  RampContext.tsx             Ramp reservation state - session id, create/cancel, SSE stream of session reservations, missed-bus alert

hooks/
  useSSE.ts                   Generic SSE hook with reconnect-with-backoff (2s->30s) on a closed connection

lib/
  types.ts                    Shared TypeScript interfaces (Stop, Vehicle, StopArrival, TripData, etc.)
  transit.ts                  Route type config (colors, labels), getRouteColor(), formatEta()
  config.ts                   apiPath() - resolves the backend base URL (explicit override, dev proxy, or runtime hostname)
```

## Key concepts

- **All Leaflet interaction happens in `layers/`.** These components use `useMap()` and return `null`. They manage `L.LayerGroup` refs internally and sync data via props.
- **Viewport culling**: StopsLayer and VehiclesLayer only render markers within `map.getBounds()`. They listen to `zoomend`/`moveend` via a `revision` counter.
- **Sibling stops**: when selecting a stop, the backend returns arrivals for all physical siblings (bus + tram + trolley variants at the same location).
- **Theming**: CSS variables in `globals.css`, toggled via `dark` class on `<html>`. No Tailwind `dark:` prefix; CSS vars directly in `style` props for dynamic values.
- **Static export, hostname-resolved API base**: `next.config.ts` sets `output: 'export'`; the app is fully client-side, no server. `lib/config.ts`'s `apiPath()` resolves the backend base URL in order: an explicit build-time `NEXT_PUBLIC_API_URL` always wins; in dev (`next dev`) it falls back to `/api` + the dev-only `rewrites()` proxy in `next.config.ts` (-> `BACKEND_URL`, default `http://localhost:3000`); otherwise it reads `window.location.hostname` at runtime, mapping the production hostname to the production API and everything else (staging, PR previews, an unrecognized origin) to the stage API — a fail-safe default, since this backend can trigger a physical hardware action. One build artifact serves every environment; there is no runtime config *fetch*, just a local hostname check.
- **Realtime data** comes from SSE (`useSSE`): vehicle positions, per-trip ETAs, and ramp reservations. `RampContext` streams session reservations over `/ramp/session/stream` (with an initial `/ramp/session` fetch), not polling.
- **SSE reconnect**: browsers can treat a non-200 SSE response as fatal and stop retrying. `useSSE` wraps `EventSource` creation so that on a `CLOSED`-state error it manually reconnects with backoff (2s -> 30s, reset on message); native browser auto-retry (for a connection that drops after being established) still handles the common case on its own.

## Rules

- **Types go in `lib/types.ts`.** Do not define `Stop`, `Vehicle`, etc. inside component files.
- **Route colors/labels come from `lib/transit.ts`.** Do not hardcode color maps in components; use `getRouteColor()`.
- **Layers do not render DOM elements.** They return `null` and manipulate Leaflet directly via refs.
- **Sheets and panels own their data fetching.** They fetch on mount/prop change and manage their own loading/error state.
- **Keep `Map.tsx` a wiring layer.** State + callbacks + composition. No inline fetch logic or complex JSX.
- **Inline `style` props for CSS variable values.** Tailwind for layout/spacing, `style={{ color: 'var(--text)' }}` for theme-dependent values that cannot be Tailwind classes.
- **API calls go through `apiPath()`** (`lib/config.ts`), never a hardcoded `/api/...` or absolute URL.
- **Component names and prop types should be self-documenting.** No excessive JSDoc.
- **Mobile responsiveness**: sheets use `max-sm:` breakpoints. StopArrivalsSheet has drag-to-resize on mobile. Test both viewports.

## Running

```bash
cd frontend
bun install
bun run dev          # Next.js dev server (proxies /api/* to BACKEND_URL)
bun run check        # biome + tsc
bun run build        # static export -> out/
```

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | _(unset)_ | Explicit build-time backend base URL; wins over everything else when set. Left unset by both local dev (falls back to `/api`) and CI (falls back to the runtime hostname lookup in `lib/config.ts`). |
| `BACKEND_URL` | `http://localhost:3000` | Dev-only backend URL, used by the `next.config.ts` rewrite proxy (only active when `NEXT_PUBLIC_API_URL` is unset). |
