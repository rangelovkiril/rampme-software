## Context

See `proposal.md` - Why. Today all four SSE routes go through `services/sse.ts`, which directly imports `gtfs/realtime.ts` and hardcodes a listener on its `realtimeEvents.on('refresh', ...)`. This is why `services/ramp/bridge.ts` has to fake `realtimeEvents.emit('refresh')` to push a ramp session update - it has no channel of its own. Two prior bug fixes constrain this design and must not regress:

- `b1023fc`: push must happen on its own fixed cadence, independent of whether the upstream GTFS-RT fetch succeeded, so an upstream stall never freezes the UI.
- `a568452` (today): the SSE response must not close after every message, or `EventSource`'s built-in auto-reconnect turns into a reconnect storm.

## Goals / Non-Goals

**Goals:**
- Give each domain (GTFS realtime, ramp reservations, and any future one) its own publish channel, so no domain has to fake another domain's event to get a push out.
- Make `services/sse.ts` a generic transport helper with no import-time knowledge of any specific domain.
- Make data freshness (per upstream GTFS-RT feed) observable and distinguishable from connection liveness.
- Preserve the two non-negotiable properties above (no freeze on upstream stall, no reconnect storm).

**Non-Goals:**
- No change to route URLs, query params, or the shape of existing data fields.
- No change to how vehicle enrichment itself is computed or cached (the per-tick cache in `routes/realtime.ts` stays as is) - only how the "something changed" signal reaches the transport layer.
- No frontend consumption of the new freshness signal (tracked in [#58](https://github.com/rangelovkiril/rampme-software/issues/58)).
- No change to the ramp MQTT protocol or hardware-facing behavior.

## Decisions

**A small domain-agnostic `Broadcaster<T>` (publish/subscribe over an async iterable) replaces the hardcoded `EventEmitter` import.** Each domain module owns and publishes to its own broadcaster instance; `services/sse.ts` accepts a broadcaster + a `getData` function and knows nothing about GTFS or ramp.
- *Alternative considered*: keep the existing `EventEmitter` but parameterize which one `services/sse.ts` listens to per call site. Rejected - it fixes the import direction but leaves the `EventEmitter`-to-async-iterable bridge, and the merge with the heartbeat timer, as hand-rolled code repeated at each call site instead of solved once.
- *Alternative considered*: use `node:events`'s built-in `events.on(emitter, 'tick')` directly per domain, folding the heartbeat into each domain's own emitter (it emits a synthetic tick on a timer even without a real change). Rejected - this moves a transport concern (connection liveness) into domain logic, which is the SRP violation in the other direction.

**Heartbeat is the generic transport helper's own responsibility.** Internally, `services/sse.ts` merges "next value from the broadcaster" with "next heartbeat tick" into one stream the generator consumes. Domain broadcasters publish only real changes; they have no heartbeat concept.

**Per-feed staleness is tracked in `gtfs/realtime.ts`**, next to the existing fetch logic that already owns success/failure knowledge for `trip-updates` and `vehicle-positions` independently (`Promise.allSettled`). The staleness threshold is a new `GTFS_RT_STALE_THRESHOLD_MS` value in `config/index.ts` (default `15000`, 3x `REFRESH_INTERVAL_MS`), following the existing config convention (no hardcoded env-driven flags in handler files).

**Combining staleness across multiple feeds is each consumer's responsibility, not the publisher's.** `gtfs/realtime.ts` reports per-feed truth only. Routes that depend on more than one feed (trip ETAs, stop arrivals both use `trip-updates` and `vehicle-positions` together, per `arrivals.ts` / `trip-details.ts`) combine the flags relevant to them. This mirrors the feed-dependency pattern already present in those files.

**The freshness signal is a distinct named SSE event (`health`), not a field spammed on every tick.** It fires only on state transitions (healthy to degraded, degraded to healthy). `EventSource` clients can listen to it separately via `addEventListener('health', ...)` without touching the default `message` handler, and clients that ignore it (frontend, for now) are unaffected since unknown named events are simply not listened to.

**`GET /realtime/vehicles` gets the same freshness metadata as the SSE equivalent**, read directly off the current per-feed degraded state (no event needed for a one-shot request) so SSE and non-SSE clients never disagree about whether the data is fresh.

## Risks / Trade-offs

- [Risk] New `Broadcaster` + generic transport abstraction is a concept the team hasn't used before → Mitigation: keep it deliberately small (on the order of the existing `makeSseStream`), fully covered by the connection-lifecycle scenarios in `specs/realtime-sse/spec.md`.
- [Risk] Elysia's generator-cancellation-on-disconnect may behave subtly differently from the current explicit `ReadableStream.cancel()` → Mitigation: verify a manual client-disconnect case per stream; the e2e suite already exercises SSE reconnect behavior (`a568452`) and should catch regressions.
- [Risk] If the ramp domain's own broadcaster isn't wired in the same change that removes the fake `realtimeEvents.emit('refresh')`, the ramp session stream silently stops receiving immediate pushes → Mitigation: task breakdown does both in the same change, not as a follow-up.
- [Risk] Adding `meta`/staleness to `GET /realtime/vehicles`'s response changes its shape → Mitigation: additive field only; update the TypeBox response schema and Swagger docs in the same change.
- [Trade-off] Combining per-feed staleness per consumer (instead of one global flag) means more code per route, but avoids a stream reporting "degraded" because of a feed it doesn't even depend on.

## Migration Plan

Entirely backend-internal and additive: existing `data` event shape is unchanged, `health` is a new event name, and `meta` is a new field on one JSON response. No feature flag needed - frontend `EventSource` clients that don't listen for `health` are unaffected. Ship as a single change: `Broadcaster` + rewritten `services/sse.ts` + per-feed staleness + `health` event + `GET /realtime/vehicles` parity, verified via the existing Playwright e2e SSE fixtures plus a manual disconnect check per stream. Rollback is a plain revert.

## Open Questions

- Exact staleness threshold default (for example, 2x vs 3x the fetch refresh interval) is deferrable - the spec only requires it be configurable, so the number can be tuned later against real Sofia Traffic API outage patterns without touching the spec or the approach.
