# RampMe

English · [Български](.github/README.bg.md)

**Making public transport accessible for everyone.**

RampMe is a live public transport map for Sofia, built around one accessibility feature: a rider near a stop reserves a wheelchair ramp, and an embedded hardware module on the vehicle deploys it over MQTT when the vehicle arrives. It shows every bus, tram, and trolleybus in real time, with live arrival predictions from Sofia Traffic's GTFS feeds.

What makes it unique is that the person who needs the ramp is the one who triggers it. No other system in the world puts the rider directly in the loop: everywhere else, ramp deployment depends on the driver noticing and acting. RampMe removes that dependency.

This repository holds both apps:

- **`backend/`** is a Bun + Elysia REST and SSE API. It decodes the GTFS static and GTFS-Realtime feeds and owns the ramp reservation lifecycle.
- **`frontend/`** is a Next.js app (React + Leaflet), statically exported and served from Cloudflare Pages.

The k3s cluster that runs the backend is managed separately in the [`fleet`](https://github.com/rangelovkiril/fleet) GitOps repository, and the ramp firmware (the Raspberry Pi controller on each vehicle) lives in [`rampme-hardware`](https://github.com/rangelovkiril/rampme-hardware). The firmware talks to the backend only through the [Ramp MQTT Protocol](https://github.com/rangelovkiril/rampme-software/wiki/Ramp-MQTT-Protocol).

## Quick start

The only prerequisite is [Bun](https://bun.sh) (v1.0 or newer). Run the two apps as separate processes; the frontend proxies `/api/*` to the backend in development.

```bash
# backend, on :3000
cd backend
bun install
bun run dev

# frontend, in a second terminal (Next picks the next free port, usually :3001)
cd frontend
bun install
bun run dev
```

The backend starts without a broker: with no `MQTT_URL` set it logs that MQTT is skipped and serves everything except the hardware path. To exercise the ramp lifecycle without hardware, start the backend with `MOCK_RAMP=true`.

Before pushing, run the same check CI runs:

```bash
bun run check   # biome + tsc, in each app
```

## Documentation

Full documentation lives in the [wiki](https://github.com/rangelovkiril/rampme-software/wiki):

- [Architecture](https://github.com/rangelovkiril/rampme-software/wiki/Architecture): how the two apps fit together and how the app is served
- [Threat Model](https://github.com/rangelovkiril/rampme-software/wiki/Threat-Model): why there is no login, and how abuse is contained
- [CI/CD](https://github.com/rangelovkiril/rampme-software/wiki/CI-CD): pipelines, branch flow, and the promotion gate
- [Ramp MQTT Protocol](https://github.com/rangelovkiril/rampme-software/wiki/Ramp-MQTT-Protocol): the contract for the hardware team
- [Contributing](https://github.com/rangelovkiril/rampme-software/wiki/Contributing): local setup and conventions

Code layout and per-module rules are documented in [`CLAUDE.md`](CLAUDE.md). Infrastructure and cluster operations are in the [fleet wiki](https://github.com/rangelovkiril/fleet/wiki).

## History

RampMe was built in 48 hours at HackTUES 12, where it placed 4th, and went on to take 3rd place at TUES Fest. Photos may land here later, no promises. See the [presentation deck](https://www.canva.com/design/DAHFDWV7DkA/-L-Wb9y9991tjE6tHmhyzA/edit) for the original pitch.
