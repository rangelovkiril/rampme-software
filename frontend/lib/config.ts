// API base resolution, in precedence order:
// 1. An explicit build-time NEXT_PUBLIC_API_URL always wins.
// 2. In dev (`next dev`), fall back to `/api`, proxied to a local backend by the
//    dev-only rewrite in next.config.ts — mirrors that file's own NODE_ENV check,
//    so local dev never reaches the hostname table below.
// 3. Otherwise (a production build, one artifact serving every environment),
//    resolve from the runtime hostname. An unrecognized origin falls back to the
//    stage API rather than production, since this backend can send a `deploy`
//    command to physical hardware — production must never be the default guess.
//    Keep this table in sync with the CORS origin allowlist in
//    backend/src/index.ts's cors({ origin: [...] }).
const PRODUCTION_HOSTNAME = 'rampme.site'
const STAGING_HOSTNAME = 'staging.rampme.pages.dev'
const PRODUCTION_API = 'https://api.rampme.site'
const STAGE_API = 'https://api-stage.rampme.site'

function resolveApiBase(): string {
  const explicit = process.env.NEXT_PUBLIC_API_URL
  if (explicit) return explicit.replace(/\/+$/, '')
  if (process.env.NODE_ENV === 'development') return '/api'

  const hostname = typeof window !== 'undefined' ? window.location.hostname : undefined
  if (hostname === PRODUCTION_HOSTNAME) return PRODUCTION_API
  if (hostname === STAGING_HOSTNAME) return STAGE_API
  return STAGE_API // unrecognized origin (including no window, e.g. build-time prerender)
}

export function apiPath(path: string): string {
  return `${resolveApiBase()}${path.startsWith('/') ? path : `/${path}`}`
}
