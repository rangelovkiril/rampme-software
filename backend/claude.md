# Sofia Accessible Transit — Backend

## What is this

REST API for Sofia's public transport. Consumes GTFS static + realtime feeds from `gtfs.sofiatraffic.bg`, enriches them with accessibility data (wheelchair ramps, low-floor vehicles), and serves them to the frontend map app.

**Stack:** Bun + Elysia + SQLite (bun:sqlite) + protobufjs for GTFS-RT decoding.

## Architecture

```
src/
  index.ts              Entry point — wires plugins and route groups, starts server
  config.ts             All env-based configuration in one place
  state.ts              Shared GTFS data holder (getGtfs/setGtfs) + jsonError helper

  routes/               HTTP handlers — thin, no business logic
    stops.ts            /stops, /stops/:id, /stops/:id/vehicles
    routes.ts           /routes, /routes/:id, /routes/shapes
    realtime.ts         /realtime/vehicles, /realtime/vehicles/:id/trip, /realtime/trip-updates

  services/             Business logic — pure functions, testable without HTTP
    arrivals.ts         Computes upcoming arrivals at a stop (schedule + RT merge)
    trip-details.ts     Builds trip stop list with predictions for a vehicle

  gtfs/                 GTFS data layer
    types.ts            All GTFS data interfaces (Stop, Route, Trip, GtfsData, etc.)
    static.ts           Fetches and parses the GTFS ZIP into in-memory Maps
    realtime.ts         Fetches and decodes GTFS-RT protobuf feeds (cached 15s)
    cache.ts            Generic TTL cache with in-flight deduplication
    time.ts             GTFS time parsing/formatting helpers (shared across services)
    services.ts         activeServiceIds() — today's active services from calendar_dates
    enrich.ts           enrichVehicles() — merges RT vehicle positions with static data

  db/
    vehicles.ts         SQLite access for vehicle accessibility data (low_floor)
```

## Key concepts

- **GTFS static data** is fetched once on startup (and refreshed daily) as a ZIP. Parsed into `GtfsData` — a collection of Maps for fast lookup by ID.
- **GTFS-RT** feeds (vehicle-positions, trip-updates) are fetched on demand with a 15-second cache.
- **Sibling stops** — Sofia's GTFS has separate stop_ids for bus/tram/trolley at the same physical stop (e.g. `A2795`, `TB2795`). They share a `stop_code`. The arrivals service queries all siblings together.
- **GTFS 24+ hour times** — GTFS allows times like `25:30:00` for post-midnight trips. `gtfs/time.ts` normalizes these.

## Rules

- **Route handlers stay thin.** Parse input, validate, call a service function, return result or error. No inline business logic in route files.
- **Business logic goes in `services/`.** These are pure-ish functions that take `GtfsData` + params and return results. This makes them testable.
- **Shared types go in `gtfs/types.ts`.** Don't define GTFS-related interfaces elsewhere.
- **Time helpers go in `gtfs/time.ts`.** Don't inline `split(':').map(Number)` or `h % 24` — use `parseGtfsTime()`, `normalizeGtfsHour()`, etc.
- **Config goes in `config.ts`.** No hardcoded flags (like `RAMP_ALL`) in handler files — use `config.rampAll`.
- **`any` for RT feeds is acceptable for now** since the protobuf-decoded JSON has no TS types. If this becomes a problem, define interfaces in `gtfs/types.ts`.
- **Don't add JSDoc that restates the obvious.** `getVehicleExtra(vehicleId)` doesn't need a docblock explaining it gets vehicle extras. Only document non-obvious behavior (edge cases, GTFS quirks).

## Running

```bash
bun install
bun run dev          # watch mode
bun run check        # biome + tsc
```

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Server port |
| `GTFS_STATIC_URL` | Sofia Traffic API | GTFS ZIP URL |
| `GTFS_RT_BASE_URL` | Sofia Traffic API | GTFS-RT base URL |
| `GTFS_REFRESH_INTERVAL` | 86400000 (24h) | Static data refresh interval (ms) |
| `PROTO_PATH` | `proto/gtfs-realtime.proto` | Protobuf definition path |
| `DB_PATH` | `vehicles.db` | SQLite database path |
| `RAMP_ALL` | `false` | Treat all vehicles as ramp-equipped (testing) |
