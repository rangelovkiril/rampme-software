## Context

See `proposal.md` - Why. CARTO now enforces an API key on `basemaps.cartocdn.com`; requests without one are served with an "API KEY REQUIRED" watermark instead of failing outright. The key is a query parameter, not a header or path segment: `?key=YOUR_KEY` appended to the existing tile URL template (e.g. `https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png?key=YOUR_KEY`). CARTO's free tier covers up to 5,000,000 tile requests/month, requested at [carto.com/basemaps/apikey](https://carto.com/basemaps/apikey) — no procurement or billing decision needed for a single-city app at this stage.

The frontend is a static export (`output: 'export'`); any `NEXT_PUBLIC_*` env var is inlined into the JS bundle at build time and is visible to anyone who inspects network requests. `NEXT_PUBLIC_API_URL` is left deliberately unset in CI (the app resolves its API base from the runtime hostname instead, see `frontend/AGENTS.md`), so it isn't actually a precedent for *how* to wire a build-time var here — but the exposure characteristic is the same for any `NEXT_PUBLIC_*` var: it can't be treated as a secret once built.

`.github/workflows/frontend.yaml` builds the static export exactly once, in the `build` job (`bun run build`), uploads that artifact, and both `deploy-staging` and `deploy-production` later run `wrangler pages deploy` against the *same* downloaded artifact — there is no separate PR-preview deploy job (`deploy-staging` and `deploy-production` both gate on `github.event_name == 'push'` to `main`; PRs only run `build`/`e2e`, never a deploy). This means: (a) there is exactly one build-time environment to inject the var into, not three, and (b) Cloudflare itself never builds this project — `wrangler pages deploy` only uploads pre-built static assets — so a Cloudflare Pages project setting (`cloudflare_pages_project.deployment_configs` in `fleet/tofu/pages.tf`) is never read by this pipeline. The var has to be available to the GitHub Actions `build` job itself, as a repository secret.

## Goals / Non-Goals

**Goals:**
- Map renders again with no watermark, in both deploy targets this pipeline actually has (staging, production), by 2026-09-10.
- Change is confined to a URL/env var edit; no behavior or visual change beyond removing the watermark.

**Non-Goals:**
- Removing the runtime dependency on a third-party tile provider — that's [self-hosted-basemap-tiles](../self-hosted-basemap-tiles/proposal.md), deliberately out of scope here.
- New automated test coverage for this change. It's a URL template edit; the existing e2e suite already asserts the map container renders, and a watermark-vs-no-watermark distinction isn't meaningfully worth a new test given the known thin coverage called out in root `AGENTS.md`.

## Decisions

- **Query param, appended to the existing `TILES` template strings** in `frontend/components/Map.tsx`, rather than switching tile providers or URL scheme. Matches CARTO's documented auth mechanism exactly and keeps the diff minimal.
- **One shared API key across both deploy targets** (staging, production), stored as the `CARTO_API_KEY` GitHub Actions repository secret and exposed to the `build` job as `NEXT_PUBLIC_CARTO_API_KEY` via `env:` in `.github/workflows/frontend.yaml`. This isn't really an "isolation" choice the way a Cloudflare-Pages-per-environment setup would be: the pipeline builds once and deploys that one artifact to both targets (see Context), so there is only one place to set the var regardless. A separate key per environment isn't achievable without splitting the single `build` job, which the 5M/month fair-use ceiling gives no reason to do for a single-city app.
- **Restrict the key by referrer/domain in the CARTO dashboard** to `rampme.site`, `*.rampme.site`, and the `staging` Cloudflare Pages deployment's domain (`*.rampme.pages.dev` or the project's specific staging subdomain — confirm the exact hostname against the live `deploy-staging` job output before locking this down). Since the key is inlined into a public static bundle (see Context), domain restriction is the only real mitigation against a third party lifting the key from the bundle and hotlinking it against CARTO's quota.

## Risks / Trade-offs

- **Key is visible in the public JS bundle** (inherent to `NEXT_PUBLIC_*` + static export) → Mitigation: this matches CARTO's own key model (a rate-limited publishable key, not a secret); domain restriction in the CARTO dashboard is the intended control, not a workaround.
- **Fair-use quota (5M tiles/month) could be exceeded** by a traffic spike or a scraper hotlinking the key despite domain restriction → Mitigation: monitor usage via the CARTO dashboard; this exact class of risk (dependency on a provider's fair-use terms) is precisely what [self-hosted-basemap-tiles](../self-hosted-basemap-tiles/proposal.md) exists to close off permanently, not something this change tries to solve.
- **CARTO changes terms again later** (stricter quota, paid tiers, deprecation) → explicitly accepted, not mitigated, here; tracked as the motivating risk for the future migration.

## Migration Plan

1. Request a free CARTO Basemaps API key at [carto.com/basemaps/apikey](https://carto.com/basemaps/apikey); set referrer/domain restriction to `rampme.site`, `*.rampme.site`, and the staging deploy's domain.
2. `gh secret set CARTO_API_KEY --repo rangelovkiril/rampme-software` (or the dashboard equivalent) with the key from step 1.
3. Add `env: NEXT_PUBLIC_CARTO_API_KEY: ${{ secrets.CARTO_API_KEY }}` to the `build` job in `.github/workflows/frontend.yaml`.
4. Update the `TILES` URL templates in `frontend/components/Map.tsx` to append `?key=${process.env.NEXT_PUBLIC_CARTO_API_KEY}`.
5. Update `frontend/AGENTS.md`'s environment variables table and the software wiki's CI/CD page with the new var, in the same PR.
6. Deploy; verify the map renders without the "API KEY REQUIRED" watermark on both the staging and production deploys.

**Rollback**: a plain `git revert` of the commit, redeployed. Note explicitly: reverting does **not** restore a working map — CARTO's key enforcement is server-side and unconditional, so the pre-change state was already broken. Rollback only makes sense to undo *this specific implementation* (e.g., wrong query param name, wrong env var wiring) while iterating, not as a "back out to safety" move. There is no feature flag and none is needed.

## Open Questions

- Whether the staging domain restriction should cover the `*.pages.dev` wildcard or only the project's specific staging subdomain (`pages-deployment-alias-url` in the `deploy-staging` job output) — an operational detail to settle when configuring the CARTO dashboard, doesn't change the code or task breakdown.
