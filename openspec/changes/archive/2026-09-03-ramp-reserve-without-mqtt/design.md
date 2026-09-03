## Context

See proposal.md - Why. `getRampBridge()` (`backend/src/services/ramp/bridge.ts`) throws when `initRampBridge()` has not run, which happens whenever `MQTT_URL` is unset (by design - see `backend/AGENTS.md`) and, briefly, during the window between server start and the MQTT connection resolving even when `MQTT_URL` is set. `routes/ramp.ts` calls `getRampBridge().publishNewReservation(r)` / `.publishCancelReservation(cancelled)` unconditionally, and no `onError` is registered on the Elysia app, so the throw becomes an unhandled 500 after the DB write already committed.

## Goals / Non-Goals

**Goals:**
- The HTTP response and DB state for reserve/cancel never depend on hardware-bridge availability.
- The fix is a small, local change to the reserve/cancel path - not a broader error-handling overhaul of the app.

**Non-Goals:**
- Not adding a global Elysia `onError` handler for unrelated routes/errors - scoped to this one call site's specific failure mode.
- Not changing what happens once a bridge *is* connected (publish behavior, topics, payload shapes) - unchanged.
- Not addressing the brief connect-in-progress window as a retry/queue problem (e.g. queuing the publish until the bridge connects) - out of scope; a reservation created during that window simply does not get a `new_reservation` publish, same as one created while genuinely offline. `resyncAllReservations()` (called once the bridge does connect) already re-publishes any reservation still `pending`/`active` at that point, which covers this case without new machinery.

## Decisions

- **Add `isRampBridgeAvailable()` alongside `getRampBridge()`** in `bridge.ts`, and guard the two call sites in `routes/ramp.ts` with it, rather than making `getRampBridge()` itself return a no-op stub object when uninitialized. A no-op stub would make "bridge missing" silently indistinguishable from "bridge connected" at every call site, including future ones; an explicit availability check keeps the skip visible at the point it happens (and lets it log once via `consola.warn`, matching the existing tagged-logging convention) without touching `getRampBridge()`'s existing contract (still throws for any call site that has a genuine invariant that a bridge must exist).

## Risks / Trade-offs

- [A reservation created while the bridge is unavailable never gets a `new_reservation` publish, so hardware doesn't know about it until backend later reconnects] → already mitigated by `resyncAllReservations()`, which re-publishes every `pending`/`active` reservation once `initMqtt()` resolves; no new mitigation needed, just confirming the existing one covers this path.

## Migration Plan

Plain revert - no environment variables, no data migration, no deployment coordination with `rampme-hardware` (the MQTT command shape and topics are unchanged; this only changes whether backend attempts to publish at all).
