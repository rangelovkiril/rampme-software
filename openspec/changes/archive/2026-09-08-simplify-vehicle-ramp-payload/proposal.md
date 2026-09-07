## Why

`EnrichedVehicle.ramp_reservations` (an array of `{id, stop_id, type, status}`) is computed on every GTFS-RT tick in `gtfs/enrich.ts` and broadcast to every `/realtime/vehicles` and `/realtime/vehicles/stream` client, but nothing reads it: the frontend's reservation UI (`RampContext`, `ResDetailCard`, `ReservationsPanel`) sources reservation state from the session-scoped `/ramp/session/stream` instead, which is the actual owner of that data. `frontend/lib/types.ts` declares the field and a test fixture sets it to `[]`, but no component ever accesses `.ramp_reservations`. It duplicates state the ramp reservation DB (`db/ramp.ts`) already owns and serves elsewhere, for no consumer. While `gtfs/enrich.ts` is already being touched for `ramp/vehicle-accessibility`, this is a good moment to drop it.

## What Changes

- **BREAKING**: `/realtime/vehicles` and `/realtime/vehicles/stream` responses drop the `ramp_reservations` field from each vehicle entry (no known external consumer, but it is a public cross-origin API).
- `services/ramp/status.ts`'s `getVehicleRampInfoFrom` stops building and returning a compact reservations list; it becomes a pure `(reservations, hasRamp) -> RampStatus` function — `VehicleRampInfo`'s reservations array is removed.
- `gtfs/enrich.ts`'s `EnrichedVehicle` drops the `ramp_reservations` field; `routes/realtime.ts`'s `EnrichedVehicleSchema` drops it from the response schema.
- `frontend/lib/types.ts`'s `EnrichedVehicle` type and `frontend/e2e/fixtures/transit.ts`'s fixture drop the field to match.

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
(none — no existing spec documents `EnrichedVehicle`'s field-level shape; this is an implementation-level payload cleanup, not a change to a specced requirement)

## Impact

- `backend/src/gtfs/enrich.ts` — `EnrichedVehicle` interface, `enrichVehicles()`
- `backend/src/services/ramp/status.ts` — `VehicleRampInfo`, `getVehicleRampInfoFrom()`
- `backend/src/routes/realtime.ts` — `EnrichedVehicleSchema`
- `frontend/lib/types.ts` — `EnrichedVehicle` type
- `frontend/e2e/fixtures/transit.ts` — vehicle fixture
- Public API: `GET /realtime/vehicles`, `GET /realtime/vehicles/stream` on `api.rampme.site` (breaking response shape change, no in-repo consumer affected)
