import { Elysia, t } from 'elysia'
import {
  cancelReservation,
  createReservation,
  deleteVehicleHardwareUrl,
  getSessionReservations,
  getVehicleReservations,
  listVehicleHardware,
  setVehicleHardwareUrl,
} from '../db/ramp'
import { jsonError } from '../state'

function sessionId(headers: Record<string, string | undefined>): string | null {
  const s = headers['x-session-id']
  if (!s || s.length < 8 || s.length > 64 || !/^[\w-]+$/.test(s)) return null
  return s
}

export const rampRoutes = new Elysia({ prefix: '/ramp' })
  .post(
    '/reserve',
    ({ body, headers }) => {
      const sid = sessionId(headers)
      if (!sid) return jsonError('Missing or invalid X-Session-Id', 400)
      const r = createReservation(sid, body.vehicle_id, body.stop_id, body.type)
      if ('error' in r) return jsonError(r.error, 429)
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
      if (!cancelReservation(id, sid)) return jsonError('Not found or resolved', 404)
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
  .get('/vehicle/:id', ({ params }) => getVehicleReservations(params.id), {
    detail: { tags: ['Ramp'], summary: 'Vehicle reservations' },
  })
  // Hardware self-registration: device sends its vehicle_id, backend derives URL from caller IP
  .post(
    '/hardware/register',
    ({ body, server, request }) => {
      const forwarded = request.headers.get('x-forwarded-for')
      const ip = forwarded ? forwarded.split(',')[0].trim() : server?.requestIP(request)?.address
      if (!ip) return jsonError('Cannot determine caller IP', 400)
      const url = `http://${ip}/status`
      setVehicleHardwareUrl(body.vehicle_id, url)
      console.log(`[ramp] hardware registered: vehicle ${body.vehicle_id} -> ${url}`)
      return { ok: true, vehicle_id: body.vehicle_id, url }
    },
    {
      body: t.Object({ vehicle_id: t.String({ minLength: 1 }) }),
      detail: { tags: ['Ramp'], summary: 'Hardware self-registration (IP auto-detected)' },
    },
  )
  .get('/hardware', () => listVehicleHardware(), {
    detail: { tags: ['Ramp'], summary: 'List registered hardware devices' },
  })
  .put(
    '/hardware/:vehicle_id',
    ({ params, body }) => {
      setVehicleHardwareUrl(params.vehicle_id, body.url)
      return { ok: true, vehicle_id: params.vehicle_id, url: body.url }
    },
    {
      body: t.Object({ url: t.String({ minLength: 7, pattern: '^https?://' }) }),
      detail: { tags: ['Ramp'], summary: 'Register hardware URL for a vehicle' },
    },
  )
  .delete(
    '/hardware/:vehicle_id',
    ({ params }) => {
      if (!deleteVehicleHardwareUrl(params.vehicle_id)) return jsonError('Not found', 404)
      return { ok: true }
    },
    { detail: { tags: ['Ramp'], summary: 'Remove hardware registration' } },
  )
