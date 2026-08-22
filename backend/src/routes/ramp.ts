import { Elysia, t } from 'elysia'
import {
  cancelReservation,
  createReservation,
  getSessionReservations,
  getVehicleReservations,
} from '../db/ramp'
import { publishCancelReservation, publishNewReservation } from '../services/ramp/bridge'
import { rampBroadcaster } from '../services/ramp/broadcaster'
import { makeSseStream } from '../services/sse'
import { jsonError } from '../services/state'

function isValidSessionId(s: string | undefined): s is string {
  return s != null && s.length >= 8 && s.length <= 64 && /^[\w-]+$/.test(s)
}

function sessionId(headers: Record<string, string | undefined>): string | null {
  const s = headers['x-session-id']
  return isValidSessionId(s) ? s : null
}

export const rampRoutes = new Elysia({ prefix: '/ramp' })
  .post(
    '/reserve',
    ({ body, headers }) => {
      const sid = sessionId(headers)
      if (!sid) return jsonError('Missing or invalid X-Session-Id', 400)
      const r = createReservation(sid, body.vehicle_id, body.stop_id, body.type)
      if ('error' in r) return jsonError(r.error, 429)
      publishNewReservation(r)
      rampBroadcaster.publish(Date.now())
      return r
    },
    {
      body: t.Object({
        vehicle_id: t.String({ minLength: 1 }),
        stop_id: t.String({ minLength: 1 }),
        type: t.Union([t.Literal('board'), t.Literal('alight')]),
      }),
      detail: { tags: ['Ramp'], summary: 'Reserve ramp' },
    },
  )
  .delete(
    '/reserve/:id',
    ({ params, headers }) => {
      const sid = sessionId(headers)
      if (!sid) return jsonError('Missing or invalid X-Session-Id', 400)
      const id = Number(params.id)
      if (!Number.isFinite(id)) return jsonError('Invalid ID', 400)
      const cancelled = cancelReservation(id, sid)
      if (!cancelled) return jsonError('Not found or resolved', 404)
      publishCancelReservation(cancelled)
      rampBroadcaster.publish(Date.now())
      return { ok: true }
    },
    { detail: { tags: ['Ramp'], summary: 'Cancel reservation' } },
  )
  .get(
    '/session',
    ({ headers }) => {
      const sid = sessionId(headers)
      if (!sid) return jsonError('Missing or invalid X-Session-Id', 400)
      return getSessionReservations(sid)
    },
    { detail: { tags: ['Ramp'], summary: 'Session reservations' } },
  )
  .get(
    '/session/stream',
    ({ query }) => {
      // EventSource can't set custom headers, so the session id travels as a
      // query param here instead of X-Session-Id.
      if (!isValidSessionId(query.session_id))
        return jsonError('Missing or invalid session_id', 400)
      const sid = query.session_id
      return makeSseStream(rampBroadcaster, async () => ({
        data: getSessionReservations(sid),
      }))
    },
    {
      query: t.Object({ session_id: t.String() }),
      detail: { tags: ['Ramp'], summary: 'SSE stream of session reservations' },
    },
  )
  .get('/vehicle/:id', ({ params }) => getVehicleReservations(params.id), {
    detail: { tags: ['Ramp'], summary: 'Vehicle reservations' },
  })
