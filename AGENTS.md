# RampMe - agent & contributor guide

This is the canonical guide for anyone working in this repository, human or AI agent. It is tool-neutral on purpose: `CLAUDE.md` is a symlink to this file, and other agents (Cursor, Codex, and future ones) read `AGENTS.md` directly, so everyone works from the same instructions with no quality drop.

Each app has its own `AGENTS.md` (also symlinked as `CLAUDE.md`) with stack-specific rules. When you change an app, read that app's file too:

- [`backend/AGENTS.md`](backend/AGENTS.md)
- [`frontend/AGENTS.md`](frontend/AGENTS.md)
- [`hw-sim/AGENTS.md`](hw-sim/AGENTS.md)

## What is this

Live public transport map for Sofia. Shows vehicles, stops, routes, and real-time arrival predictions. The core feature is wheelchair ramp reservation: a rider near a stop requests a ramp, and an embedded hardware module on the vehicle deploys it via MQTT when the vehicle arrives. What makes it unique is that the person who needs the ramp triggers it, rather than depending on the driver to notice.

The system spans three repositories:

- **`rampme-software`** (this repo) holds three apps: `backend/`, `frontend/`, and `hw-sim/` (a
  standalone ramp hardware simulator, used for non-production environments and testing - see
  [`hw-sim/AGENTS.md`](hw-sim/AGENTS.md)).
- **`fleet`** (https://github.com/rangelovkiril/fleet) is the Flux GitOps repo for the k3s cluster that runs the backend.
- **`rampme-hardware`** (https://github.com/rangelovkiril/rampme-hardware) is the ramp firmware: the Raspberry Pi controller on each vehicle. It talks to the backend only through the ramp MQTT protocol.

The two apps deploy independently and communicate cross-origin: the frontend is static on Cloudflare Pages and calls the backend at `https://api.rampme.site/...`, plus Server-Sent Events for live streams.

## Documentation lives in the wikis

Code layout and rules live in these `AGENTS.md` files. Everything above the code lives in two wikis:

- **[software wiki](https://github.com/rangelovkiril/rampme-software/wiki)**: architecture, threat model, CI/CD, ramp MQTT protocol, contributing.
- **[fleet wiki](https://github.com/rangelovkiril/fleet/wiki)**: the cluster and infrastructure runbook.

When you need context beyond the code, read the wikis before guessing.

## Behavior specs live in OpenSpec

Capability-level specs of what the system does (not how it's built) live in `openspec/`, managed through the OpenSpec workflow (`/opsx:propose`, `/opsx:apply`, `/opsx:sync`, `/opsx:archive`):

- **`openspec/specs/<capability>/spec.md`** is the ground truth once a capability has been proposed, implemented, and archived. Check there before assuming behavior.
- **`openspec/changes/<name>/`** holds in-flight change proposals (a draft spec delta, a design, and tasks) before they're implemented and archived into the main specs.

Propose a change there before implementing behavior that isn't already specced, rather than editing code first and documenting later.

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

## Tooling (MCP)

Two MCP servers are expected when working in this repo, both launched via `bunx` so nothing has to be installed globally:

- **Context7** provides up-to-date library documentation. Consult it before relying on memory for Next.js 16, Elysia, react-leaflet, or Bun APIs; these move faster than model training data. Reach for it whenever an API detail is uncertain rather than guessing.
- **Playwright** drives a real browser. Use it to verify frontend changes end to end (map interactions, the ramp reservation flow, mobile viewports) and to capture accessibility-tree snapshots when working on a11y. It is a dev-time tool independent of the app runtime.

> [!IMPORTANT]
> The frontend has no automated test suite yet. The backend has a `bun:test` suite (`backend/test/`, run via `bun run test`, gated in CI alongside `bun run check`) but it only covers the realtime SSE transport (`Broadcaster`, `makeSseStream`, per-feed staleness) — GTFS static/GTFS-RT decoding and the ramp reservation lifecycle remain untested. Treat both gaps as known rather than a reason to trust a change because it compiles: verify behavior by exercising it, and prefer adding a test to leaving one absent.

`.mcp.json` in the repo root declares both, but only some hosts read that file, so what is actually available differs per editor.

**Agents: check availability, then prompt.** MCP servers are started by the editor or host, never by you, so you cannot launch one yourself. Before work that depends on them (any frontend verification, accessibility work, or an uncertain library API), check whether the Playwright or Context7 tools are present in your session. If they are missing, do not quietly fall back to guessing an API or to asking the developer to click through the app by hand. Say which server is missing, why the task needs it, and how to enable it for their editor:

- **Claude Code** reads `.mcp.json` in the repo root; approve the project servers when prompted.
- **Cursor** reads `.cursor/mcp.json` (project) or `~/.cursor/mcp.json` (global), using the same JSON shape as `.mcp.json`.
- **Codex** uses `~/.codex/config.toml`; quickest path is `codex mcp add playwright -- bunx @playwright/mcp@latest` and `codex mcp add context7 -- bunx @upstash/context7-mcp@latest`.
- **Zed** uses `context_servers` in its own `settings.json`, or Settings, then AI, then MCP Servers, then Add Server.

Playwright additionally needs its browser binary once per machine: `bunx playwright install chromium`.

Cloudflare tooling lives in the `fleet` repo's own MCP config, since infrastructure work happens there.

## Infrastructure (summary)

The backend runs as a single container in a k3s cluster managed by the `fleet` GitOps repo, reached through a Cloudflare Tunnel and Envoy Gateway. The frontend is a static export served from Cloudflare Pages. TLS terminates at the Cloudflare edge, so the cluster ingress is plain HTTP and there is no cert-manager. The authoritative runbook is the [fleet wiki](https://github.com/rangelovkiril/fleet/wiki); anything that changes deployment or the request path must be reflected there in the same change.
