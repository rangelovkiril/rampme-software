## 1. Broadcaster primitive

- [ ] 1.1 Add a domain-agnostic `Broadcaster<T>` (publish/subscribe over an async iterable) as a new `backend/src/services/` module, with no import from any domain module, and verify it with a standalone unit test (publish before/after subscribe, multiple subscribers).

## 2. Generic SSE transport

- [ ] 2.1 Rewrite `services/sse.ts` as an Elysia `function*`/`sse()` generator helper that takes a `Broadcaster<T>` + a `getData` function and sends the current data on connect; verify it no longer imports from `gtfs/realtime.ts` (`grep -n "gtfs/realtime" backend/src/services/sse.ts` returns nothing).
- [ ] 2.2 Implement the heartbeat inside the transport helper by merging the broadcaster's async iterable with an interval tick; verify a stream with no domain publishes still emits a heartbeat within the configured interval.
- [ ] 2.3 Verify per-connection cleanup releases the broadcaster subscription and clears the heartbeat timer on disconnect (manual client-disconnect check per stream, or an integration test asserting no dangling listeners after a request is aborted).

## 3. GTFS realtime staleness and own broadcaster

- [ ] 3.1 Add a staleness threshold to `config/index.ts` (env-driven, documented default) and list the new environment variable in `backend/AGENTS.md`'s environment variable table.
- [ ] 3.2 Track `lastSuccessAt` per feed (`trip-updates`, `vehicle-positions`) in `gtfs/realtime.ts` and compute a per-feed `stale` boolean against the configured threshold; verify with a unit test covering both feeds succeeding/failing independently.
- [ ] 3.3 Replace `gtfs/realtime.ts`'s `EventEmitter` with its own `Broadcaster`, publishing `{ tick, feeds: { tripUpdates, vehiclePositions } }` on the existing push cadence; verify the push still fires unconditionally on upstream fetch failure (regression check for the `b1023fc` guarantee).

## 4. Wire GTFS-derived SSE routes

- [ ] 4.1 Update `/realtime/vehicles/stream` to subscribe to the GTFS broadcaster via the new transport helper, combining only the `vehiclePositions` staleness flag; verify the route still returns `text/event-stream` with an unchanged data shape.
- [ ] 4.2 Update `/realtime/vehicles/:id/trip/etas` and `/stops/:id/vehicles/stream` to combine both `tripUpdates` and `vehiclePositions` staleness flags; verify each stream's combined degraded state matches "degraded if either dependency feed is degraded".
- [ ] 4.3 Emit the `health` SSE event (distinct from the data event) only on healthy-to-degraded and degraded-to-healthy transitions, for each of the three GTFS-derived streams; verify with a test asserting no `health` event fires across consecutive unchanged ticks.

## 5. Ramp session stream gets its own channel

- [ ] 5.1 Add a `Broadcaster` owned by the ramp domain (alongside `services/ramp/bridge.ts`) and update `/ramp/session/stream` to subscribe to it via the transport helper.
- [ ] 5.2 Replace the forced `realtimeEvents.emit('refresh')` call in `services/ramp/bridge.ts` (the `payload.state === 'deployed'` branch) with a publish to the ramp broadcaster; verify a session stream client still receives an immediate push on hardware deploy confirmation.

## 6. Non-SSE freshness parity

- [ ] 6.1 Add a `meta.stale` field (per feed, combined per the same rule as the SSE routes) to the `GET /realtime/vehicles` response, backed by the same per-feed degraded state used by the SSE streams, with a TypeBox response schema update; verify the Swagger/OpenAPI doc reflects the new field.
- [ ] 6.2 Verify SSE/non-SSE parity: request `GET /realtime/vehicles` while `vehicle-positions` is degraded (test double or forced threshold) and assert the same staleness indication as the `/realtime/vehicles/stream` `health` event.

## 7. Full verification

- [ ] 7.1 Run `bun run check` in `backend/` and confirm it passes.
- [ ] 7.2 Run the existing Playwright e2e suite, including the SSE reconnect fixture fixed in `a568452`, and confirm no regression in reconnect behavior.
- [ ] 7.3 Manually verify each of the four SSE routes against a running dev server: initial send on connect, heartbeat during a quiet period, and clean disconnect with no dangling listeners or timers.
