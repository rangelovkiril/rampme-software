**Status: future milestone, not scheduled.** Captured now so the direction is agreed and ready to pick up; [carto-api-key](../carto-api-key/proposal.md) is the immediate fix and stands on its own regardless of when (or whether) this proceeds.

## Why

Even with a paid Carto API key, the map depends at runtime on a third-party tile provider that can gate, rate-limit, or discontinue its free tier at any time — Carto just did exactly that. Cloudflare, which the frontend already runs on, makes self-hosting the basemap (vector tiles + styling) straightforward and cheap. Closing off the "provider changes the deal" risk permanently, on infrastructure already trusted for this project, is worth more than a recurring API key bill.

## What Changes

- Replace `react-leaflet`/`leaflet` with `maplibre-gl`. Every imperative Leaflet layer (`StopsLayer`, `VehiclesLayer`, `RouteLinesLayer`, `LiveLocation`) and `MapControls` gets rewritten against the MapLibre GL API, keeping the existing imperative-per-layer-component pattern rather than adopting `react-map-gl`.
- Replace Carto raster tiles with a self-hosted PMTiles vector tile extract (Sofia/Bulgaria region) served from Cloudflare R2, read client-side via the `pmtiles` MapLibre protocol — no tile server to run.
- Generate light/dark basemap styles client-side from the same vector source via `@protomaps/basemaps`, replacing the current `dark_all`/`light_all` raster URL pair. A visual spike against the actual dark theme is expected before this locks in as the approach.
- Restore visible OpenStreetMap attribution, currently suppressed via `.leaflet-control-attribution { display: none !important; }` in `frontend/app/globals.css` — required by OSM's data license regardless of provider, and independent of this migration's fate.
- **BREAKING (internal only)**: removes `leaflet`, `react-leaflet`, `@types/leaflet`, and whatever Carto API key/env var [carto-api-key](../carto-api-key/proposal.md) introduced. `frontend/e2e/transit.spec.ts` and `frontend/e2e/mobile-sheets.spec.ts` assert against `.leaflet-*` DOM classes and need rewriting; canvas-rendered features (route lines, accuracy circle) lose DOM-selector testability and need an explicit replacement strategy (`page.evaluate` + `queryRenderedFeatures()`, or visual snapshots).

## Capabilities

### New Capabilities
- `frontend/basemap-tiles`: the app renders an interactive light/dark basemap without depending on a third-party tile API at runtime.

### Modified Capabilities
(none — no existing capability in `openspec/specs/frontend/` covers map rendering today)

## Impact

- `frontend/components/Map.tsx` — map initialization, tile/style source.
- `frontend/components/layers/StopsLayer.tsx`, `VehiclesLayer.tsx`, `RouteLinesLayer.tsx`, `LiveLocation.tsx` — full rewrite from `L.*` imperative APIs to `maplibre-gl`.
- `frontend/components/ui/MapControls.tsx` — zoom/theme controls against the MapLibre map instance.
- `frontend/app/globals.css` — drop `.leaflet-*` selectors, restore attribution, adjust the dark-mode tile filter hack (no longer applicable to vector styles).
- `frontend/e2e/transit.spec.ts`, `frontend/e2e/mobile-sheets.spec.ts` — replace `.leaflet-*` locators.
- `frontend/package.json` — drop `leaflet`/`react-leaflet`/`@types/leaflet`, add `maplibre-gl`, `pmtiles`, `@protomaps/basemaps`.
- New infrastructure: a Cloudflare R2 bucket (and possibly a small Worker) hosting the PMTiles extract, plus a periodic (manual, low-frequency) process to refresh it from a fresh OSM extract. This is frontend-side infrastructure, distinct from the `fleet` GitOps repo that runs the backend — document it in the software wiki's architecture page, not the fleet wiki.
- `frontend/AGENTS.md` — stack line (`Leaflet (react-leaflet)` → `MapLibre GL`) and the "Key concepts" section describing layer components.
- No backend, MQTT protocol, or CORS impact.
