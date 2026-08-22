// API base is baked in at build time. CI sets NEXT_PUBLIC_API_URL to the
// public backend URL; local dev falls back to /api, proxied to the local
// backend by the dev-only rewrite in next.config.ts.
const API_BASE = (process.env.NEXT_PUBLIC_API_URL ?? '/api').replace(/\/+$/, '')

export function apiPath(path: string): string {
  return `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`
}
