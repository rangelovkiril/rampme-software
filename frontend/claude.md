# RampMe — Frontend

## What is this

Live public transport map for Sofia. Shows vehicles, stops, routes, and real-time arrival predictions. Core feature: wheelchair ramp request button when user is near a stop.

**Stack:** Next.js 16 (App Router) + React 19 + Leaflet (react-leaflet) + Tailwind CSS 4.

## Architecture

```
app/
  layout.tsx            Root layout — dark mode script, Leaflet CSS import
  page.tsx              Single page, dynamically imports Map (SSR disabled for Leaflet)
  globals.css           CSS variables for theming (light/dark), component sizes
  api/health/route.ts   Health check

components/
  Map.tsx               Orchestrator — holds all app state, composes everything below

  layers/               Leaflet map layers (use useMap(), render nothing to DOM)
    StopsLayer.tsx      Stop markers, click to select
    VehiclesLayer.tsx   Vehicle markers (circles at low zoom, detailed icons at high zoom)
    RouteLinesLayer.tsx Polyline overlay for selected route
    LiveLocation.tsx    User's GPS position with accuracy circle

  sheets/               Bottom sheets (slide-up panels)
    StopArrivalsSheet.tsx   Arrivals at selected stop, ramp request button, mobile drag-to-resize
    VehicleTripSheet.tsx    Trip timeline for selected vehicle with stop-by-stop predictions

  panels/               Side panel sub-panels (inside SidePanel shell)
    AlertsPanel.tsx     Active vehicle counts by type
    RoutesPanel.tsx     Route list with search + type filter chips
    StopsPanel.tsx      Stop list with search
    FilterChip.tsx      Reusable filter chip component

  ui/                   Standalone UI controls (positioned outside MapContainer)
    MapControls.tsx     Zoom, theme toggle, location tracking buttons
    FloatingNav.tsx     Top navigation pills (Alerts/Routes/Stops)

  SidePanel.tsx         Thin shell — handles open/close, renders active sub-panel

lib/
  types.ts              All shared TypeScript interfaces (Stop, Vehicle, StopArrival, TripData, etc.)
  transit.ts            Route type config (colors, labels), getRouteColor(), formatEta()
  geo.ts                distanceMeters() — haversine formula

hooks/
  usePollingFetch.ts    Generic fetch + setInterval + cleanup hook
```

## Key concepts

- **All Leaflet interaction happens in `layers/`.** These components use `useMap()` and return `null`. They manage `L.LayerGroup` refs internally and sync data via props.
- **Viewport culling** — StopsLayer and VehiclesLayer only render markers within `map.getBounds()`. They listen to `zoomend`/`moveend` via a `revision` counter.
- **Sibling stops** — when selecting a stop, the backend returns arrivals for all physical siblings (bus + tram + trolley variants at the same location).
- **Theming** — CSS variables in `globals.css`, toggled via `dark` class on `<html>`. No Tailwind dark: prefix — we use CSS vars directly in `style` props for dynamic values.
- **Backend proxy** — `next.config.ts` rewrites `/api/*` to the backend URL. Components fetch from `/api/...`.

## Rules

- **Types go in `lib/types.ts`.** Don't define `Stop`, `Vehicle`, etc. inside component files.
- **Route colors/labels come from `lib/transit.ts`.** Don't hardcode `ROUTE_COLORS` maps in components — use `getRouteColor()` and `getRouteLabel()`. Single source of truth.
- **Layers don't render DOM elements.** They return `null` and manipulate Leaflet directly via refs.
- **Sheets and panels own their data fetching.** They fetch on mount/prop change and manage their own loading/error state.
- **Keep Map.tsx as a wiring layer.** State + callbacks + composition. No inline fetch logic or complex JSX.
- **Inline `style` props for CSS variable values.** Tailwind for layout/spacing, `style={{ color: 'var(--text)' }}` for theme-dependent values that can't be Tailwind classes.
- **No excessive JSDoc.** Component names and prop types should be self-documenting. Only comment GTFS quirks or non-obvious behavior.
- **Mobile responsiveness** — sheets use `max-sm:` breakpoints. StopArrivalsSheet has drag-to-resize on mobile. Test both viewports.

## Data flow

```
User taps vehicle marker
  → VehiclesLayer calls onVehicleSelect(vehicle)
  → Map.tsx sets selectedVehicle + selectedRoute
  → VehicleTripSheet opens, fetches /api/realtime/vehicles/:id/trip
  → RouteLinesLayer fetches /api/routes/shapes?ids=...

User taps stop marker
  → StopsLayer calls onStopSelect(stop)
  → Map.tsx sets selectedStop
  → StopArrivalsSheet opens, fetches /api/stops/:id/vehicles
  → Polls every 15s for updated ETAs
```

## Running

```bash
bun install
bun run dev          # Next.js dev server
bun run check        # biome + tsc
```

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `BACKEND_URL` | `http://localhost:3000` | Backend API URL (used in next.config.ts rewrite) |
