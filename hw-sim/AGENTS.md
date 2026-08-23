# hw-sim

Standalone ramp hardware simulator. Read the root [`AGENTS.md`](../AGENTS.md) first for the
project overview and the cross-cutting working rules (docs sync, tooling, `bun run check`, no
`any`, commits). This file covers hw-sim-specific structure and rules.

**Stack:** Bun + `aedes` (in-process MQTT broker) + Elysia (HTTP control API) +
`@sinclair/typebox` (schema validation) + `consola` (logging).

```
src/
  index.ts        Entry point - starts the broker and the HTTP control API
  config.ts        Env-based configuration
  protocol.ts       The ramp MQTT protocol subset hw-sim implements (topics, action/state
                     literals, TypeBox schema) - duplicated from backend/bridge.ts, not shared
  broker.ts         Aedes broker setup: feeds `ramp/{vehicle_id}/cmd` publishes into
                     simulator.ts, publishes `ramp/{vehicle_id}/state` back out
  simulator.ts       Per-vehicle state: outstanding reservations + active behavior profile
  control.ts         HTTP control API (Elysia) - POST /vehicles/:vehicleId/profile

test/
  hw-sim.test.ts    bun:test suite - a real MQTT client against a real (ephemeral-port)
                     broker instance, exercising the wire protocol end to end
```

## What this is

hw-sim stands in for a real ramp module on the ramp MQTT protocol (documented in full in the
[wiki](https://github.com/rangelovkiril/rampme-software/wiki/Ramp-MQTT-Protocol)), so the
reservation-to-deploy lifecycle can be exercised without physical hardware or a second managed
broker. It is one process acting as both the MQTT broker and the simulated hardware: a backend
instance points its `MQTT_URL` at hw-sim instead of the production broker.

The protocol subset hw-sim implements (see `protocol.ts`):

- `ramp/{vehicle_id}/cmd` (backend -> hw-sim): `new_reservation`/`cancel_reservation` (tracked
  per vehicle, no side effect beyond bookkeeping) and `deploy` (triggers the active profile's
  behavior).
- `ramp/{vehicle_id}/state` (hw-sim -> backend): `deploying`, `deployed`, `done`, `error`.

hw-sim is a testing counterpart, not a certification suite for `rampme-hardware`'s firmware -
see the change's design doc for the full rationale (non-goals).

## Behavior profiles

Each vehicle has its own active profile, defaulting to `happy` for any vehicle never explicitly
set. Switch it at runtime via the control API - no restart required:

```bash
curl -X POST http://localhost:4000/vehicles/1234/profile \
  -H 'Content-Type: application/json' \
  -d '{"profile": "error"}'
```

| Profile | Behavior on `deploy` |
|---|---|
| `happy` (default) | Publishes `deploying`, then `deployed`, then `done`, each `DEPLOY_STEP_DELAY_MS` apart |
| `no-ack` | Publishes nothing - exercises the caller's own deploy-acknowledgement timeout |
| `error` | Publishes a single `error` state instead of the happy-path sequence |

## Rules

- **The MQTT interface accepts unauthenticated connections.** hw-sim is never reachable outside
  the cluster network (see design.md) - do not add broker credentials.
- **Protocol constants live in `protocol.ts`**, not inlined in `broker.ts` or `simulator.ts`.
- **`simulator.ts` takes a `StatePublisher` callback rather than reaching into the broker
  directly**, so profile/reservation logic stays testable without a live MQTT connection.

## Running

```bash
cd hw-sim
bun install
bun run dev          # watch mode
bun run check        # biome + tsc
bun run test         # bun:test, spins up a real broker on an ephemeral port
```

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `MQTT_PORT` | `1883` | Port the in-process MQTT broker listens on |
| `PORT` | `4000` | Port the HTTP control API listens on |
| `DEPLOY_STEP_DELAY_MS` | `300` | Delay between each state transition in the `happy` profile's deploy sequence |
