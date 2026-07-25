# RampMe - agent & contributor guide

This is the canonical guide for anyone working in this repository, human or AI agent. It is tool-neutral on purpose: `CLAUDE.md` is a symlink to this file, and other agents (Cursor, Codex, and future ones) read `AGENTS.md` directly, so everyone works from the same instructions with no quality drop.

Each app has its own `AGENTS.md` (also symlinked as `CLAUDE.md`) with stack-specific rules. When you change an app, read that app's file too:

- [`backend/AGENTS.md`](backend/AGENTS.md)
- [`frontend/AGENTS.md`](frontend/AGENTS.md)

## What is this

Live public transport map for Sofia. Shows vehicles, stops, routes, and real-time arrival predictions. The core feature is wheelchair ramp reservation: a rider near a stop requests a ramp, and an embedded hardware module on the vehicle deploys it via MQTT when the vehicle arrives. What makes it unique is that the person who needs the ramp triggers it, rather than depending on the driver to notice.

The system spans three repositories:

- **`rampme-software`** (this repo) holds both apps: `backend/` and `frontend/`.
- **`fleet`** (https://github.com/rangelovkiril/fleet) is the Flux GitOps repo for the k3s cluster that runs the backend.
- **`rampme-hardware`** (https://github.com/rangelovkiril/rampme-hardware) is the ramp firmware: the Raspberry Pi controller on each vehicle. It talks to the backend only through the ramp MQTT protocol.

The two apps deploy independently and communicate cross-origin: the frontend is static on Cloudflare Pages and calls the backend at `https://api.rampme.site/...`, plus Server-Sent Events for live streams.

## Documentation lives in the wikis

Code layout and rules live in these `AGENTS.md` files. Everything above the code lives in two wikis:

- **[software wiki](https://github.com/rangelovkiril/rampme-software/wiki)**: architecture, threat model, CI/CD, ramp MQTT protocol, contributing.
- **[fleet wiki](https://github.com/rangelovkiril/fleet/wiki)**: the cluster and infrastructure runbook.

When you need context beyond the code, read the wikis before guessing.

## Working rules (apply everywhere)

- **Keep docs in sync with reality, immediately.** If a change alters infrastructure, deployment, configuration, CORS origins, environment variables, or a documented contract (the ramp MQTT protocol, the API), update the relevant wiki page, `AGENTS.md`, or README in the same change. Infra changes in particular must be reflected at once. Stale docs are the exact problem these files exist to prevent; do not reintroduce it.
- **When unsure, consult the wikis** rather than assuming.
- **Use tools according to availability.** Do not assume a fixed toolchain; adapt to what the environment actually has.
- **Prefer `bunx <pkg>`** over a globally installed package on the developer's machine.
- **Run `bun run check`** (biome + tsc) in the app you changed before treating work as done.
- **Branch and open a PR; never commit straight to `main`.** Use Conventional Commits, matching the existing history (`feat(scope): ...`, `fix(scope): ...`, `refactor: ...`).
- **No `any`.** Untrusted external input (MQTT payloads, request bodies) gets a TypeBox schema plus a runtime check; internally decoded, structurally guaranteed data uses plain TypeScript interfaces.
- **Do not hand-edit generated or managed files.** Regenerate `backend/src/gtfs/gtfs-realtime.json` with `bun run proto`; never hand-edit the Flux image tags (the `# {"$imagepolicy": ...}` markers, which live in the `fleet` repo).
- **Do not add JSDoc or comments that restate the obvious.** Document only non-obvious behavior: edge cases, GTFS quirks, hardware protocol subtleties.

## Infrastructure (summary)

The backend runs as a single container in a k3s cluster managed by the `fleet` GitOps repo, reached through a Cloudflare Tunnel and Envoy Gateway. The frontend is a static export served from Cloudflare Pages. TLS terminates at the Cloudflare edge, so the cluster ingress is plain HTTP and there is no cert-manager. The authoritative runbook is the [fleet wiki](https://github.com/rangelovkiril/fleet/wiki); anything that changes deployment or the request path must be reflected there in the same change.
