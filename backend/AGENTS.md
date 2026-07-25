# Backend

Elysia on Bun. REST + SSE API. Read the root [`AGENTS.md`](../AGENTS.md) first for the project overview and the cross-cutting working rules (docs sync, tooling, `bun run check`, no `any`, generated files, commits). This file covers backend-specific structure and rules.

**Stack:** Bun + Elysia + SQLite (`bun:sqlite`) + protobufjs (GTFS-RT decoding) + `mqtt` (ramp hardware) + `@sinclair/typebox` (schema validation) + `consola` (logging).

```
src/
  index.ts                    Entry point - wires plugins/routes, starts server, boots MQTT + proximity checker
  config/index.ts             All env-based configuration in one place
  config/swagger.ts           OpenAPI/Swagger plugin setup

  routes/                     HTTP handlers - thin, no business logic
    stops.ts                  /stops, /stops/:id, /stops/:id/vehicles(/stream)
    transit.ts                /routes, /routes/:id, /routes/shapes
    realtime.ts               /realtime/vehicles(/stream), /realtime/vehicles/:id/trip(/etas), /realtime/trip-updates
    ramp.ts                   /ramp/reserve, /ramp/reserve/:id, /ramp/session(/stream), /ramp/vehicle/:id

  services/
    state.ts                  Shared GTFS data holder (getGtfs/setGtfs) + jsonError helper
    sse.ts                    makeSseStream() - SSE response w/ retry hint + 20s heartbeat
    mqtt.ts                   MQTTHub - pattern-based subscriptions with per-handler parsers, publish helper
    transit/
      arrivals.ts             Upcoming arrivals at a stop (schedule + RT merge, sibling stops, after-midnight services)
      trip-details.ts         Trip stop list with RT predictions for a vehicle (getVehicleTripDetails, getTripEtas)
    ramp/
      bridge.ts                Reservations <-> hardware over MQTT (publish cmd, handle hw state, deploy timeout)
      proximity.ts             GPS proximity checker - triggers deploy when a ramp-reserved vehicle nears its stop
      status.ts                Ramp status/reservations shaping for enrichment (getReservationsByVehicle, getVehicleRampInfoFrom)

  gtfs/                       GTFS data layer
    types.ts                  All GTFS + GTFS-RT data interfaces (Stop, Route, Trip, GtfsData, GtfsRt*)
    static.ts                 Fetches & parses the GTFS ZIP into in-memory Maps + precomputed indexes
    realtime.ts               Fetches/decodes GTFS-RT protobuf feeds, single refresh tick, emits 'refresh' for SSE
    services.ts               activeServiceIds() - active service_ids for a given calendar date
    time.ts                   GTFS time parsing/formatting + computeScheduledEtaMinutes (shared midnight-wrap logic)
    enrich.ts                 enrichVehicles() - merges RT vehicle positions with static data + ramp status

  db/
    ramp.ts                   SQLite access for ramp reservations (create/cancel/status, session + vehicle queries)

proto/
  gtfs-realtime.proto          Minimal GTFS-RT proto (FeedMessage, TripUpdate, VehiclePosition, ...)
```

## Key concepts

- **GTFS static data** is fetched once on startup (and refreshed on `GTFS_REFRESH_INTERVAL`) as a ZIP, parsed into `GtfsData`: Maps for fast lookup by ID, plus precomputed `tripsByRoute` / `stopIdsByRoute` indexes.
- **GTFS-RT** (vehicle-positions, trip-updates) is fetched on a single background tick (`REFRESH_INTERVAL_MS` in `gtfs/realtime.ts`); a `refresh` event fires once per successful fetch, driving SSE pushes and a per-tick enriched-vehicle cache in `routes/realtime.ts` (memoized so N clients do not each recompute enrichment).
- **GTFS-RT typing**: decoded protobuf JSON is typed via `GtfsRt*` interfaces in `gtfs/types.ts` (camelCase, matching `proto/gtfs-realtime.proto`); a single type assertion at the `FeedMessage.decode().toJSON()` boundary is the only place the wire format is untyped.
- **Sibling stops**: Sofia's GTFS has separate stop_ids for bus/tram/trolley at the same physical stop (e.g. `A2795`, `TB2795`), sharing a `stop_code`. Arrivals are queried across all siblings together.
- **GTFS 24+ hour times**: GTFS allows times like `25:30:00` for post-midnight trips on the same service day, and separately, yesterday's active service can have stop_times >= 24:00 that land on today. `gtfs/time.ts` (`computeScheduledEtaMinutes`, `normalizeGtfsHour`) and `services/transit/arrivals.ts` (`collectScheduledArrivals`) both handle this.
- **Ramp reservations** are SQLite rows (`db/ramp.ts`) with a `pending -> active -> done` (or `cancelled`/`expired`) lifecycle. `services/ramp/bridge.ts` mirrors state to/from hardware over MQTT topics `ramp/{vehicle_id}/cmd` and `ramp/{vehicle_id}/state`; `services/ramp/proximity.ts` triggers the deploy command via GPS distance to the reserved stop. The client-facing contract is the [ramp MQTT protocol](https://github.com/rangelovkiril/rampme-software/wiki/Ramp-MQTT-Protocol) in the wiki; keep it in sync when the topics or payloads change.
- **SSE** (`services/sse.ts`) sends a `retry: 3000` hint and a `: hb` heartbeat every 20s so Cloudflare's edge and the tunnel do not reap idle streams (100s idle cutoff). Session ramp reservations are pushed over `/ramp/session/stream`.
- **MQTT payload validation** uses TypeBox (`@sinclair/typebox` + `Value.Check`) at the point untrusted hardware input enters the system (`HardwareStateSchema` in `bridge.ts`). This is the pattern for any new untrusted-input parsing. Internally decoded, structurally guaranteed data (GTFS-RT) uses plain TS interfaces instead; do not add TypeBox validation to hot per-tick paths.
- **Logging** goes through `consola`, tagged per subsystem via `consola.withTag('mqtt' | 'ramp-mqtt' | 'proximity')`. No bare `console.*` calls.

## Rules

- **Route handlers stay thin.** Parse input, validate, call a service function, return result or error.
- **Business logic goes in `services/`.** Pure-ish functions that take `GtfsData` (+ params) and return results, testable without HTTP.
- **Shared types go in `gtfs/types.ts`.** Do not define GTFS or GTFS-RT interfaces elsewhere.
- **Time helpers go in `gtfs/time.ts`.** Do not inline `split(':').map(Number)` or `h % 24`; use `parseGtfsTime()`, `normalizeGtfsHour()`, `computeScheduledEtaMinutes()`.
- **Config goes in `config/index.ts`.** No hardcoded env-driven flags in handler files.
- **Logging goes through `consola`**, tagged per subsystem; pick the level that matches severity (`.error` for failures, `.warn` for degraded-but-running, `.info`/`.success` for routine events).

## Running

```bash
cd backend
bun install
bun run dev          # watch mode
bun run check        # biome + tsc
bun run proto        # regenerate src/gtfs/gtfs-realtime.json after editing proto/gtfs-realtime.proto
```

Starts without a broker: with no `MQTT_URL` set, MQTT and the ramp hardware path are skipped. Use `MOCK_RAMP=true` to simulate hardware and exercise the reservation lifecycle without a broker.

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Server port |
| `GTFS_STATIC_URL` | Sofia Traffic API | GTFS static ZIP URL |
| `GTFS_RT_BASE_URL` | Sofia Traffic API | GTFS-RT base URL |
| `GTFS_REFRESH_INTERVAL` | 86400000 (24h) | Static data refresh interval (ms) |
| `PROTO_PATH` | `proto/gtfs-realtime.proto` | Protobuf definition path |
| `RAMP_DB_PATH` | `./data/ramp.db` | SQLite path for ramp reservations |
| `MOCK_RAMP` | `false` | Mock ramp hardware responses (testing) |
| `MQTT_URL` | _(unset)_ | MQTT broker URL; if unset, MQTT/ramp hardware integration is skipped entirely |
| `MQTT_USERNAME` / `MQTT_PASSWORD` | _(unset)_ | MQTT broker credentials |
| `MQTT_CLIENT_ID` | `rampme-backend` | MQTT client ID |
| `DEPLOY_TIMEOUT_MS` | `20000` | How long to wait for hardware "deploying" ack before expiring a reservation |
