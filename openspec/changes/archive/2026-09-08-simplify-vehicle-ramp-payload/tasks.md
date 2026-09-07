## 1. Backend

- [x] 1.1 Change `services/ramp/status.ts`'s `getVehicleRampInfoFrom` to return a bare `RampStatus` instead of `VehicleRampInfo`, dropping the reservations list it built; verify `bun run check` passes with no remaining reference to `VehicleRampInfo`.
- [x] 1.2 Drop `ramp_reservations` from `EnrichedVehicle` in `gtfs/enrich.ts` and from `EnrichedVehicleSchema` in `routes/realtime.ts`; verify `bun run check` and that `bun run test` still passes.
- [x] 1.3 Confirm `GET /realtime/vehicles` no longer includes `ramp_reservations` in its response (manual check against a running dev server or the Swagger schema).

## 2. Frontend

- [x] 2.1 Drop `ramp_reservations` from `EnrichedVehicle` in `frontend/lib/types.ts` and from the vehicle fixture in `frontend/e2e/fixtures/transit.ts`; verify `bun run check` passes with no remaining reference.
- [x] 2.2 Run `bun run test:e2e` to confirm no test asserted on the removed field.
