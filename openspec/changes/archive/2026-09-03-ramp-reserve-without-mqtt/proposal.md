## Why

`POST /ramp/reserve` and `DELETE /ramp/reserve/:id` (`backend/src/routes/ramp.ts`) call `getRampBridge().publishNewReservation(r)` / `.publishCancelReservation(cancelled)` unconditionally after the DB write already succeeded. When `MQTT_URL` is unset, `initRampBridge()` never runs, so `getRampBridge()` throws (`"Ramp bridge not initialized"`), and no `onError` handler is registered anywhere in the app — the client gets an unhandled 500 even though the reservation/cancellation is already recorded in the database. `backend/AGENTS.md` documents this as the intended normal dev mode ("Starts without a broker... MQTT and the ramp hardware path are skipped"), so the current behavior contradicts the project's own documented contract. This is tracked as issue #69 (priority:high).

## What Changes

- `POST /ramp/reserve` and `DELETE /ramp/reserve/:id` succeed and return normally when no hardware bridge is connected (`MQTT_URL` unset, or `initRampBridge()` hasn't completed yet), instead of throwing an unhandled 500.
- The DB mutation (create/cancel) and the HTTP response are unaffected by hardware-bridge availability; only the best-effort MQTT publish to notify hardware is skipped when there's no bridge to publish through.
- Behavior with `MQTT_URL` set and a connected bridge is unchanged.

## Capabilities

### New Capabilities
- `ramp/reservations`: reservation creation and cancellation succeed and are durably recorded independent of hardware-bridge (MQTT) availability; publishing to hardware is a best-effort side effect of an already-successful reservation, not a precondition for it.

## Impact

- `backend/src/routes/ramp.ts` — guard the `getRampBridge()` calls in the `POST /reserve` and `DELETE /reserve/:id` handlers.
- `backend/src/services/ramp/bridge.ts` — likely exposes a safe way to check/use bridge availability (e.g. an `isRampBridgeAvailable()` alongside `getRampBridge()`, or a no-op fallback), decided in design.md.
- No environment variables, MQTT topic shapes, or wiki-documented protocol contract change — this only changes how the backend behaves when the bridge is absent, which `backend/AGENTS.md` already describes as supported.
