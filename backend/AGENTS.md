# Backend

Elysia on Bun. REST + SSE API. Read the root [`AGENTS.md`](../AGENTS.md) first for the project overview and the cross-cutting working rules (docs sync, tooling, `bun run check`, no `any`, generated files, commits). This file covers backend-specific structure and rules.

**Stack:** Bun + Elysia + SQLite (`bun:sqlite`) + protobufjs (GTFS-RT decoding) + `mqtt` (ramp hardware) + `@sinclair/typebox` (schema validation) + `consola` (logging).

```
src/
  index.ts                    Entry point - wires plugins/routes, starts server, boots MQTT + proximity checker
  config/index.ts             All env-based configuration in one place, as one TypeBox schema:
                              defaults, bounds, and coercion live with the variable
  config/swagger.ts           OpenAPI/Swagger plugin setup

  schemas/index.ts            Every request/response shape as a TypeBox model, registered with .model();
                              the TS types are derived from these, and the GTFS/SQLite -> wire mapping lives here

  plugins/
    gtfs-ready.ts             Macro resolving loaded GtfsData into a handler, or short-circuiting with 503
    errors.ts                 NotFoundError/UpstreamError + the single onError that turns them into responses

  routes/                     HTTP handlers - thin, no business logic
    stops.ts                  /stops, /stops/:id, /stops/:id/vehicles(/stream)
    transit.ts                /routes, /routes/:id, /routes/shapes
    realtime.ts               /realtime/vehicles(/stream), /realtime/vehicles/:id/trip(/etas), /realtime/trip-updates
    ramp.ts                   /ramp/reserve, /ramp/reserve/:id, /ramp/session(/stream), /ramp/vehicle/:id

  services/
    state.ts                  Shared GTFS data holder (getGtfs/setGtfs)
    broadcaster.ts            Broadcaster<T> - domain-agnostic publish/subscribe over an async iterable
    sse.ts                    makeSseStream() - generic SSE transport: takes a Broadcaster + getData, handles retry hint, heartbeat, health-transition events, cleanup
    mqtt.ts                   MQTTHub - pattern-based subscriptions with per-handler parsers, publish helper
    transit/
      arrivals.ts             Upcoming arrivals at a stop (schedule + RT merge, sibling stops, after-midnight services)
      trip-details.ts         Trip stop list with RT predictions for a vehicle (getVehicleTripDetails, getTripEtas)
    ramp/
      bridge.ts               Reservations <-> hardware over MQTT (publish cmd, handle hw state, deploy timeout)
      broadcaster.ts          rampBroadcaster - ramp domain's own Broadcaster, published to on reservation state changes
      proximity.ts            GPS proximity checker - triggers deploy when a ramp-reserved vehicle nears its stop
      status.ts               Ramp status derivation for enrichment (getReservationsByVehicle, getVehicleRampStatusFrom)

  gtfs/                       GTFS data layer
    types.ts                  All GTFS + GTFS-RT data interfaces (Stop, Route, Trip, GtfsData, GtfsRt*).
                              These keep GTFS's own snake_case; the wire shapes live in schemas/
    static.ts                 Fetches & parses the GTFS ZIP into in-memory Maps + precomputed indexes
    realtime.ts               Fetches/decodes GTFS-RT protobuf feeds; tracks per-feed staleness; publishes ticks on its own Broadcaster
    feed-health.ts            FeedTracker - tracks time since a feed's last successful fetch, reports staleness against a threshold
    services.ts               activeServiceIds() - active service_ids for a given calendar date
    time.ts                   GTFS time parsing/formatting + computeScheduledEtaMinutes (shared midnight-wrap logic)
    enrich.ts                 enrichVehicles() - merges RT vehicle positions with static data + ramp status
    accessibility.ts          createAccessibilityResolver() - loads/reloads the vehicle accessibility dataset, resolves a live vehicle.id to ramp-equipped/not/unknown

  data/                       Static JSON assets, not code - nothing in src/ imports these anymore (see below)
    model-accessibility.json  Curated model -> low_floor table (hand-maintained, rarely changes)
    vehicle-accessibility.seed.json  Fallback default for the image, for anyone running it outside the fleet topology

  db/
    ramp.ts                   SQLite access for ramp reservations (create/cancel/status, session + vehicle queries)

proto/
  gtfs-realtime.proto          Minimal GTFS-RT proto (FeedMessage, TripUpdate, VehiclePosition, ...)

test/                          bun:test suite, mirrors src/ (test/gtfs/, test/services/)
```

## Key concepts

- **GTFS static data** is fetched once on startup (and refreshed on `GTFS_REFRESH_INTERVAL`) as a ZIP, parsed into `GtfsData`: Maps for fast lookup by ID, plus precomputed `tripsByRoute` / `stopIdsByRoute` / `stopTimesByStop` / `stopTimesByTrip` / `shapesByRoute` indexes. Only the indexes are kept — the flat `stopTimes` and `shapes` lists are local build inputs. `parseCsv` honours RFC 4180 quoting; Sofia's feed has rows whose quoted names contain a comma, and splitting on bare commas shifts every later column.
- **The schema is the type.** Every request and response shape is declared once in `schemas/index.ts`, registered with `.model()`, and its TypeScript type derived with `typeof Schema.static`. Routes reference models by name in their `response`, so responses are validated and appear in `/docs`, and the frontend derives its own types from the same models through Elysia Eden — never write a parallel interface. `Stop`/`Route`/`Trip`/`StopTime`/`CalendarDate` (GTFS columns) and `RampReservation` (SQLite columns) keep their source spelling; `toStopResponse`/`toRouteResponse`/`toReservationResponse` are the one boundary where that becomes the API's camelCase.
- **Errors** go through `plugins/errors.ts`: throw `NotFoundError` or `UpstreamError` (or wrap an upstream call in `upstream()`), and the single `onError` maps them to 404/502. Anything unexpected becomes a typed 500. Routes never build a raw `Response`; use the `status()` context helper so Elysia can validate and document the result.
- **Routes that need loaded GTFS** opt in with `gtfsReady: true` (`plugins/gtfs-ready.ts`), which resolves `gtfs` into the handler already narrowed, or answers 503. SSE handlers deliberately do not use it — they return `null` for a dataless tick rather than failing the stream.
- **GTFS-RT** (vehicle-positions, trip-updates) is fetched on a single background tick (`REFRESH_INTERVAL_MS` in `gtfs/realtime.ts`), independently of a *separate* fixed-cadence push loop that publishes to `gtfsRealtimeBroadcaster` unconditionally, even if the fetch fails (an upstream stall must never freeze the UI). Each feed's staleness is tracked independently via `FeedTracker` (`gtfs/feed-health.ts`) against `GTFS_RT_STALE_THRESHOLD_MS`. The broadcaster tick also drives a per-tick enriched-vehicle cache in `routes/realtime.ts` (memoized so N clients do not each recompute enrichment).
- **GTFS-RT typing**: decoded protobuf JSON is typed via `GtfsRt*` interfaces in `gtfs/types.ts` (camelCase, matching `proto/gtfs-realtime.proto`); a single type assertion at the `FeedMessage.decode().toJSON()` boundary is the only place the wire format is untyped.
- **Sibling stops**: Sofia's GTFS has separate stop_ids for bus/tram/trolley at the same physical stop (e.g. `A2795`, `TB2795`), sharing a `stop_code`. Arrivals are queried across all siblings together.
- **GTFS 24+ hour times**: GTFS allows times like `25:30:00` for post-midnight trips on the same service day, and separately, yesterday's active service can have stop_times >= 24:00 that land on today. `gtfs/time.ts` (`computeScheduledEtaMinutes`, `normalizeGtfsHour`) and `services/transit/arrivals.ts` (`collectScheduledArrivals`) both handle this.
- **Ramp reservations** are SQLite rows (`db/ramp.ts`) with a `pending -> active -> done` (or `cancelled`/`expired`) lifecycle. `services/ramp/bridge.ts` mirrors state to/from hardware over MQTT topics `ramp/{vehicle_id}/cmd` and `ramp/{vehicle_id}/state`; `services/ramp/proximity.ts` triggers the deploy command via GPS distance to the reserved stop. The client-facing contract is the [ramp MQTT protocol](https://github.com/rangelovkiril/rampme-software/wiki/Ramp-MQTT-Protocol) in the wiki; keep it in sync when the topics or payloads change.
- **SSE** (`services/sse.ts`) is a generic transport: `makeSseStream(broadcaster, getData)` sends a `retry: 3000` hint and the current data on connect, re-sends on every `Broadcaster` publish, and heartbeats (`: hb`) every 20s during quiet periods so Cloudflare's edge and the tunnel do not reap idle streams (100s idle cutoff). It knows nothing about GTFS or ramp - each domain owns and publishes to its own `Broadcaster<T>` (`gtfsRealtimeBroadcaster` in `gtfs/realtime.ts`, `rampBroadcaster` in `services/ramp/broadcaster.ts`), so one domain's signal never has to be faked to push another's stream (e.g. `/ramp/session/stream`). GTFS-derived streams also get a distinct `health` SSE event on staleness transitions (healthy<->degraded), separate from the regular data event.
- **Vehicle accessibility** has two datasets with very different volatility, deliberately kept separate, and neither is imported by any `.ts` module anymore — both live in `data/` as plain checked-in files, not code. `data/model-accessibility.json` is hand-curated (model -> low_floor), reviewed like any other source change, and barely ever changes; it's fetched over HTTP (`raw.githubusercontent.com`) by a small dependency-free Node script published as a GitHub gist, run weekly by the `fleet` repo's own `accessibility-refresh` workflow, which joins it against a live trinmo.org crawl and commits the result there as a `ConfigMap` — no code in this repo runs that crawl, since it's simple enough (fetch, filter, join, write) that it doesn't need this codebase's TypeScript/TypeBox/test machinery, and living outside both repos means it can be edited without a PR in either. Flux applies fleet's commit like any other change, no in-cluster CronJob or RBAC. `gtfs/accessibility.ts`'s loader just reads `RAMP_ACCESSIBILITY_DATA_PATH` and reloads on an interval — it has no idea the file's origin is a Git-committed ConfigMap rather than a local edit. `data/vehicle-accessibility.seed.json` (baked into the Docker image, see `Dockerfile`) is only a fallback default for the image outside this specific fleet topology.
- **Accessibility coverage gaps stay `unknown` on purpose — close them by improving trinmo's public data, not by adding a private one.** A never-photographed vehicle has no entry in the reference dataset and reports `unknown`, which is correct, not a bug to work around. RampMe does not run its own crowdsourced vehicle-sighting pipeline to fill gaps faster (an explicit non-goal, revisit only if trinmo access degrades): that would duplicate an established community's work and add reporting/moderation infrastructure this repo doesn't need. To close a specific gap sooner, contribute the photo/tag to trinmo.org directly — the weekly crawl picks up any public improvement there automatically, no code change here.
- **MQTT payload validation** uses TypeBox (`@sinclair/typebox` + `Value.Check`) at the point untrusted hardware input enters the system (`HardwareStateSchema` in `bridge.ts`). This is the pattern for any new untrusted-input parsing. Internally decoded, structurally guaranteed data (GTFS-RT) uses plain TS interfaces instead; do not add TypeBox validation to hot per-tick paths.
- **Logging** goes through `consola`, tagged per subsystem via `consola.withTag('mqtt' | 'ramp-mqtt' | 'proximity')`. No bare `console.*` calls.

## Rules

- **Route handlers stay thin.** Parse input, validate, call a service function, return result or error.
- **Business logic goes in `services/`.** Pure-ish functions that take `GtfsData` (+ params) and return results, testable without HTTP.
- **Shared types go in `gtfs/types.ts`.** Do not define GTFS or GTFS-RT interfaces elsewhere.
- **Time helpers go in `gtfs/time.ts`.** Do not inline `split(':').map(Number)` or `h % 24`; use `parseGtfsTime()`, `normalizeGtfsHour()`, `computeScheduledEtaMinutes()`.
- **Config goes in `config/index.ts`.** No hardcoded env-driven flags in handler files, and no `process.env` reads outside it. Every variable is a field on one TypeBox `EnvSchema` carrying its own default and bounds; `Value.Convert` coerces the string the environment gives us and `Value.Errors` reports every problem at once, so a malformed value names itself and stops startup rather than becoming `NaN`. `config.mqtt` is `null` when `MQTT_URL` is unset, so "no broker" is a branch the type system enforces rather than a truthiness check on a URL.
- **Logging goes through `consola`**, tagged per subsystem; pick the level that matches severity (`.error` for failures, `.warn` for degraded-but-running, `.info`/`.success` for routine events).
- **Reach for extraction when a module resists testing, not as a blanket rule.** Two shapes come up often enough to name, but apply either only where it actually buys testability — not to every stateful module or every side effect:
  - State held across calls (timers, in-flight tracking, connections) → a `createX(dependency, config)` factory returning an instance that owns its own private state, with production wiring a single instance behind `initX()`/`getX()` (mirroring `getGtfs()`/`getMqtt()`). `services/ramp/bridge.ts`'s `createRampBridge(mqtt, timeoutMs)` / `initRampBridge()` / `getRampBridge()` is the worked example; a test calls `createRampBridge()` directly with a fake `mqtt` and a short timeout, no module-level state to reset between tests.
  - A pure computation mixed with a side effect (state update, I/O, logging) → extract the computation into a plain `f(input) -> output` function and leave the effectful caller as a thin pass-through. The frontend's `computeRampUpdate(prev, curr)` (`frontend/lib/ramp-updates.ts`) is the worked example: `RampContext`'s `applyReservations` just calls it and applies the result to state.

## Running

```bash
cd backend
bun install
bun run dev          # watch mode
bun run check        # biome + tsc
bun run test         # bun:test, files under test/ mirroring src/
bun run proto        # regenerate src/gtfs/gtfs-realtime.json after editing proto/gtfs-realtime.proto
```

Starts without a broker: with no `MQTT_URL` set, MQTT and the ramp hardware path are skipped. To exercise the reservation lifecycle without physical hardware, point `MQTT_URL` at [`hw-sim`](../hw-sim/AGENTS.md) instead.

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Server port |
| `GTFS_STATIC_URL` | Sofia Traffic API | GTFS static ZIP URL |
| `GTFS_RT_BASE_URL` | Sofia Traffic API | GTFS-RT base URL |
| `GTFS_REFRESH_INTERVAL` | 86400000 (24h) | Static data refresh interval (ms) |
| `GTFS_RT_STALE_THRESHOLD_MS` | `15000` | How long since a GTFS-RT feed's last successful fetch before it's considered degraded |
| `RAMP_DB_PATH` | `./data/ramp.db` | SQLite path for ramp reservations |
| `RAMP_ACCESSIBILITY_DATA_PATH` | `./data/vehicle-accessibility.json` | Path to the vehicle wheelchair-ramp accessibility reference dataset, rebuilt out-of-band by a `fleet`-scheduled script (see `openspec/specs/ramp/vehicle-accessibility`); missing file means every vehicle resolves as unknown |
| `RAMP_ACCESSIBILITY_REFRESH_MS` | `3600000` (1h) | How often the backend reloads the accessibility dataset from disk to pick up a scheduled refresh |
| `RAMP_CLEANUP_INTERVAL_MS` | `3600000` (1h) | How often resolved reservations older than 24h are swept from the SQLite table |
| `TZ` | `Europe/Sofia` | IANA zone every GTFS wall-clock time is interpreted in. Read through `config/index.ts`, so a container that leaves it unset still reads GTFS times as Sofia local time rather than UTC |
| `MQTT_URL` | _(unset)_ | MQTT broker URL; if unset, MQTT/ramp hardware integration is skipped entirely |
| `MQTT_USERNAME` / `MQTT_PASSWORD` | _(unset)_ | MQTT broker credentials |
| `MQTT_CLIENT_ID` | `rampme-backend` | MQTT client ID |
| `DEPLOY_TIMEOUT_MS` | `20000` | How long to wait for hardware "deploying" ack before expiring a reservation. Read through `config/index.ts`, not `process.env`, like everything in this table |
