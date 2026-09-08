'use client'

import type { App } from '@backend/index'
import { treaty } from '@elysiajs/eden'
import { apiBase } from '@/lib/config'

/**
 * Eden's treaty() takes an origin, not a path: handed `/api` it builds
 * `https://api/...`. In dev the base is the same-origin `/api` prefix served by
 * next.config.ts's rewrite proxy, so it is made absolute here.
 */
function edenOrigin(): string {
  const base = apiBase()
  if (/^https?:\/\//.test(base)) return base
  if (typeof window === 'undefined') return `http://localhost:3000${base}`
  return `${window.location.origin}${base}`
}

/**
 * Typed client for the backend. Every request and response shape comes from the
 * backend's own route definitions, so a wire-format change fails `tsc` here
 * rather than rendering nothing in the browser.
 *
 * Eden covers HTTP only; SSE goes through hooks/useSSE.ts, which types its
 * payloads from the same schema models.
 */
export const api = treaty<App>(edenOrigin())
