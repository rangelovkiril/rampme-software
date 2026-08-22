## Why

`services/sse.ts` (the shared SSE helper behind all four backend streams) grew accretively over several unrelated fixes: the original polling-to-SSE migration, a later decoupling of fetch timing from push timing, and a ramp-reservation push that was bolted onto the GTFS refresh event instead of getting its own signal. The result is no longer traceable end to end from the code alone - reconstructing it took a full archaeology pass through git history. Concretely, `services/sse.ts` (meant to be a generic transport helper) directly imports and hardcodes a listener on `gtfs/realtime.ts`'s `realtimeEvents`, so the ramp session stream has no channel of its own and instead fakes a GTFS refresh event to get a push out. Separately, when the upstream Sofia Traffic API degrades, connected clients keep receiving pushes on schedule with no signal that the underlying data has stopped changing - "connection alive" and "data fresh" are conflated, which risks giving riders (and the ramp reservation flow) false confidence in stale vehicle positions.

## What Changes

- Replace the hand-rolled `ReadableStream`/`Response` in `services/sse.ts` with Elysia's native `function*` + `sse()` generator support.
- Introduce a small domain-agnostic `Broadcaster<T>` (publish/subscribe over an async iterable). Each domain (GTFS realtime, ramp reservations) owns and publishes to its own broadcaster instance; `services/sse.ts` becomes a generic transport helper with zero knowledge of GTFS or ramp domain concepts, taking a broadcaster + a `getData` function.
- `gtfs/realtime.ts` tracks `lastSuccessAt` per feed (`trip-updates`, `vehicle-positions`) and computes a `stale` flag per feed against a new configurable threshold.
- Add a new, configurable staleness threshold to `config/index.ts` (env-driven, following the existing config convention) instead of a hardcoded constant.
- Add an explicit `health` SSE event, separate from the regular data event, emitted only on state transitions (healthy to degraded, degraded to healthy) for streams that depend on GTFS-RT feeds. Routes that depend on more than one feed (trip ETAs, stop arrivals) combine the relevant per-feed flags themselves; the publisher only reports per-feed truth.
- Extend the plain (non-SSE) `GET /realtime/vehicles` JSON response with the same staleness metadata, so SSE and non-SSE clients observe consistent truth about data freshness. Additive field, not a removal or a shape change to existing fields.
- Frontend consumption of the `health` signal (banner, dimmed markers, or similar) is explicitly out of scope for this change; tracked separately in [#58](https://github.com/rangelovkiril/rampme-software/issues/58).

## Capabilities

### New Capabilities
- `realtime-sse`: the SSE transport contract shared by the GTFS realtime streams (`/realtime/vehicles/stream`, `/realtime/vehicles/:id/trip/etas`, `/stops/:id/vehicles/stream`) and the ramp session stream (`/ramp/session/stream`) - connection lifecycle (initial send, heartbeat, retry hint, disconnect cleanup), the publish/subscribe mechanism domains use to signal a change, and the explicit per-feed data-freshness (`health`) signal.

### Modified Capabilities
(none - no existing specs predate this change)

## Impact

- `backend/src/services/sse.ts` - rewritten as a generic transport helper over Elysia generators
- `backend/src/gtfs/realtime.ts` - per-feed staleness tracking; publishes via its own `Broadcaster` instead of the shared `EventEmitter`
- `backend/src/routes/realtime.ts`, `backend/src/routes/stops.ts` - consume the new transport helper; combine per-feed staleness relevant to each route
- `backend/src/routes/ramp.ts`, `backend/src/services/ramp/bridge.ts` - publish to their own `Broadcaster` instead of faking `realtimeEvents.emit('refresh')`
- `backend/src/config/index.ts` - new staleness threshold config value
- No frontend code changes in this proposal; a follow-up GitHub issue tracks frontend consumption of the `health` event
