## 1. CARTO account setup

- [ ] 1.1 Request a free CARTO Basemaps API key at carto.com/basemaps/apikey and verify the dashboard shows it active under the fair-use (5M tiles/month) tier
- [ ] 1.2 Restrict the key's allowed referrers/domains in the CARTO dashboard to `rampme.site`, `*.rampme.site`, and the staging deploy's domain, and verify a request from an unlisted origin is rejected

## 2. Frontend code

- [ ] 2.1 Update the `TILES` URL templates in `frontend/components/Map.tsx` to append `?key=${process.env.NEXT_PUBLIC_CARTO_API_KEY}` to both the `dark` and `light` entries
- [ ] 2.2 Run `bun run check` in `frontend/` and verify it passes with no new biome/tsc errors

## 3. Deployment config

- [ ] 3.1 `gh secret set CARTO_API_KEY --repo rangelovkiril/rampme-software` (or the dashboard equivalent) with the key from 1.1
- [ ] 3.2 Add `env: NEXT_PUBLIC_CARTO_API_KEY: ${{ secrets.CARTO_API_KEY }}` to the `build` job in `.github/workflows/frontend.yaml` — the one job that runs `bun run build`, whose output artifact both `deploy-staging` and `deploy-production` reuse unchanged; no Cloudflare Pages/`fleet`/OpenTofu change is involved

## 4. Docs sync

- [ ] 4.1 Update `frontend/AGENTS.md`'s environment variables table with `NEXT_PUBLIC_CARTO_API_KEY` (name, default, description matching the design's decisions)
- [ ] 4.2 Update the software wiki's CI/CD page to document the new `CARTO_API_KEY` repository secret

## 5. Verification

- [ ] 5.1 Deploy to production and verify the map renders both dark and light styles with no "API KEY REQUIRED" watermark
- [ ] 5.2 Verify the staging deploy (`deploy-staging` job's `pages-deployment-alias-url`) also renders correctly
