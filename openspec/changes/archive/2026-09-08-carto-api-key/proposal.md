## Why

Carto put its basemap tile endpoints (`{s}.basemaps.cartocdn.com`, used for the `dark`/`light` map styles) behind an API key. Unauthenticated requests now fail, which breaks the map for every visitor. Need a fast, low-risk fix in place by 2026-09-10; the real fix (removing the dependency on a third-party tile provider entirely) is tracked separately in [self-hosted-basemap-tiles](../self-hosted-basemap-tiles/proposal.md) as a future milestone, not urgent enough to block this.

## What Changes

- Add a Carto API key to the `dark`/`light` `TileLayer` request URLs in `frontend/components/Map.tsx`.
- The key is injected via a new build-time env var, not hardcoded.
- The var is set as a GitHub Actions repository secret (`CARTO_API_KEY`) in `rampme-software`, exposed to the build as `NEXT_PUBLIC_CARTO_API_KEY` via `env:` on `.github/workflows/frontend.yaml`'s `build` job. **Not** a Cloudflare Pages project setting: `bun run build` runs once in that job and the resulting `frontend/out` artifact is the one thing `wrangler pages deploy` uploads to both the staging and production Pages deploys (see `frontend.yaml`'s own header comment) — Cloudflare never builds this project itself, so `cloudflare_pages_project.deployment_configs.env_vars` in `fleet/tofu/pages.tf` would have no effect here.
- No user-visible behavior change: the map keeps rendering the same `dark_all`/`light_all` raster tiles as before; only the outgoing request now carries a key.

## Capabilities

No spec-level behavior changes — the app's basemap rendering behaves identically to a user, only the tile request authentication changes. `skip_specs: true` is set in this change's `.openspec.yaml`.

### New Capabilities
(none)

### Modified Capabilities
(none)

## Impact

- `frontend/components/Map.tsx:19-22` — the `TILES` URL map and the `TileLayer` `url` prop.
- New env var (e.g. `NEXT_PUBLIC_CARTO_API_KEY`) — needs an entry in `frontend/AGENTS.md`'s "Environment variables" table in the same change, per root `AGENTS.md`'s docs-sync rule.
- `.github/workflows/frontend.yaml`'s `build` job — new `env:` entry sourcing `NEXT_PUBLIC_CARTO_API_KEY` from the `CARTO_API_KEY` repository secret. No `fleet`/Cloudflare/OpenTofu change: `fleet/tofu/pages.tf` only tracks the `cloudflare_pages_project`/domain, not build config, and this project's builds never run on Cloudflare's side (see `design.md` Context).
- Document the new repo secret on the software wiki's CI/CD page as part of this change.
- No backend, MQTT protocol, or CORS impact.
