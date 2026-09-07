## Why

RampMe's core feature (ramp reservation) currently can't tell riders which vehicles even have a ramp: the only signal `gtfs/enrich.ts` reads for this, GTFS static `trips.wheelchair_accessible`, is `0` ("no info") for 100% of the ~30,750 trips in Sofia's official feed (`gtfs.sofiatraffic.bg`) — confirmed by decoding the live feed directly. `ramp_status` is therefore always `unknown`, `has_ramp` is always `false`, and the map/arrivals UI never actually differentiates vehicles by accessibility, which defeats the product's reason to exist. A usable substitute exists: cross-referencing Sofia's live GTFS-RT `vehicle.id` (e.g. `A2053`) against trinmo.org's crowd-sourced fleet registry (an inventory-number-to-model mapping, verified end-to-end against 8/8 live vehicles) resolves to a real model, and a model-to-low-floor table resolves accessibility. Need this live and demonstrable by 2026-09-10.

## What Changes

- Add a static `inventory -> { type, model }` reference dataset built by crawling trinmo.org's per-model detail endpoint (`/api/vehicles/:model-url`) for currently active (status "В движение") models across BUS/TRAM/TROLLEY, filtered by expected vehicle type derived from the GTFS route-id prefix (`A`→bus, `TM`→tram, `TB`→trolleybus) to avoid matches against a historically reused inventory number.
- Add a static, human-curated `model -> low_floor` table (already drafted as `sofia_transport_low_floor.json`), sourced primarily from Wikipedia/manufacturer data; cross-check against trinmo's own `specifications.accessibility` field where present (it exists for only ~29% of active models, mostly older stock, so it can't be the primary source but is a useful corroboration/override signal, including its non-boolean `"Частично нископодов"` (partially low-floor) case).
- Both datasets are refreshed out-of-band on a schedule (a `fleet` repo CronJob mounting a shared volume the backend reads), **not** fetched per request or per GTFS-RT tick — trinmo.org is an undocumented, unauthenticated internal API of a community site with no published SLA, so the backend's live request path must have zero runtime dependency on it.
- `backend/src/gtfs/enrich.ts` resolves each live vehicle's accessibility by stripping the route-type prefix from `vehicle.id` to get the inventory number, looking it up in the refreshed reference dataset, and falling back to `ramp_status: 'unknown'` (today's existing fallback semantics, no regression) when the vehicle is missing from the dataset (never-photographed or genuinely new stock).
- Frontend gains a visible accessibility indicator on the vehicle marker itself (`frontend/components/layers/VehiclesLayer.tsx`), not just in a detail sheet as today — has-ramp / no-ramp / unknown must be distinguishable at a glance on the map, which is the whole point of this change.

## Capabilities

### New Capabilities
- `ramp/vehicle-accessibility`: determining, for a live GTFS-RT vehicle, whether it physically has a wheelchair ramp — the reference-dataset refresh contract, the enrichment lookup and its unknown-fallback behavior, and the map's visual distinction of has-ramp/no-ramp/unknown vehicles. Cross-app by nature (backend resolves and serves the fact, frontend renders it), so it stays one capability rather than being split by app.

### Modified Capabilities
(none — `realtime-sse` governs stream lifecycle/freshness only, not this field's semantics)

## Impact

- `backend/src/gtfs/enrich.ts` — replace the always-false `trip?.wheelchair_accessible === 1` check with the inventory-based lookup
- `backend/src/services/ramp/status.ts` — `getVehicleRampInfoFrom`'s `hasRamp` input now reflects real data instead of a constant `false`
- `backend/src/config/index.ts` — new env var for the refreshed dataset's file path (name/default finalized in design.md)
- New backend module (path TBD in design.md) — loads/watches the refreshed dataset file, exposes a pure `resolveAccessibility(vehicleId, routeId) -> boolean | null` lookup
- `frontend/components/layers/VehiclesLayer.tsx` — marker-level visual indicator for has-ramp/no-ramp/unknown
- `frontend/lib/types.ts`, `frontend/e2e/fixtures/transit.ts` — no field-shape change expected (reuses existing `ramp_status`), but fixtures should cover the new non-`unknown` states
- `fleet` repo (separate) — new CronJob manifest + mounted volume to refresh the dataset on a schedule; needs a fleet wiki runbook entry per this repo's infra-sync rule
- `backend/AGENTS.md` — environment variable table gains the new path variable
