import { consola } from 'consola'
import { Elysia, t } from 'elysia'
import { getRampDb } from '../db/ramp'
import { NotFoundError } from '../plugins/errors'
import { models } from '../schemas'
import { getRampBridge, isRampBridgeAvailable } from '../services/ramp/bridge'
import { rampBroadcaster } from '../services/ramp/broadcaster'
import { makeSseStream } from '../services/sse'

const log = consola.withTag('ramp-mqtt')

/** Opaque client-generated identifier; the only thing tying a rider to their reservations. */
const SessionIdSchema = t.String({ minLength: 8, maxLength: 64, pattern: '^[\\w-]+$' })

export const rampRoutes = new Elysia({ prefix: '/ramp' })
  .use(models)
  .guard(
    {
      headers: t.Object({ 'x-session-id': SessionIdSchema }),
    },
    (app) =>
      app
        // Keeps the pre-schema status and body for a rejected session id or
        // reservation id, rather than Elysia's default 422 validation shape.
        .onError({ as: 'scoped' }, ({ code, error, status }) => {
          if (code !== 'VALIDATION') return
          if (error.type === 'headers')
            return status(400, { error: 'Missing or invalid X-Session-Id' })
          if (error.type === 'params') return status(400, { error: 'Invalid ID' })
        })
        .resolve(({ headers }) => ({ sessionId: headers['x-session-id'] }))
        .post(
          '/reserve',
          ({ body, sessionId, status }) => {
            const r = getRampDb().createReservation(
              sessionId,
              body.vehicle_id,
              body.stop_id,
              body.type,
            )
            if ('error' in r) return status(429, { error: r.error })
            if (isRampBridgeAvailable()) {
              getRampBridge().publishNewReservation(r)
            } else {
              log.warn(`no bridge available — reservation ${r.id} not published to hardware`)
            }
            rampBroadcaster.publish(Date.now())
            return r
          },
          {
            // This request shape is also hand-written in frontend/contexts/RampContext.tsx's
            // apiReserve() fetch body and asserted in frontend/e2e/fixtures/transit.ts's
            // reserveRequests mock — keep all three in sync when it changes.
            body: 'ReserveBody',
            response: { 200: 'Reservation', 400: 'Error', 429: 'Error' },
            detail: { tags: ['Ramp'], summary: 'Reserve ramp' },
          },
        )
        .delete(
          '/reserve/:id',
          ({ params, sessionId }) => {
            const cancelled = getRampDb().cancelReservation(params.id, sessionId)
            if (!cancelled) throw new NotFoundError('Not found or resolved')
            if (isRampBridgeAvailable()) {
              getRampBridge().publishCancelReservation(cancelled)
            } else {
              log.warn(
                `no bridge available — cancellation of ${cancelled.id} not published to hardware`,
              )
            }
            rampBroadcaster.publish(Date.now())
            return { ok: true }
          },
          {
            params: t.Object({ id: t.Numeric() }),
            response: { 200: 'Cancelled', 400: 'Error', 404: 'Error' },
            detail: { tags: ['Ramp'], summary: 'Cancel reservation' },
          },
        )
        .get('/session', ({ sessionId }) => getRampDb().getSessionReservations(sessionId), {
          response: { 200: 'Reservations', 400: 'Error' },
          detail: { tags: ['Ramp'], summary: 'Session reservations' },
        }),
  )
  .get(
    '/session/stream',
    ({ query }) =>
      makeSseStream(rampBroadcaster, async () => ({
        data: getRampDb().getSessionReservations(query.session_id),
      })),
    {
      // EventSource can't set custom headers, so the session id travels as a
      // query param here instead of X-Session-Id.
      query: t.Object({ session_id: SessionIdSchema }),
      error: ({ code, error, status }) => {
        if (code === 'VALIDATION' && error.type === 'query')
          return status(400, { error: 'Missing or invalid session_id' })
      },
      detail: { tags: ['Ramp'], summary: 'SSE stream of session reservations' },
    },
  )
  .get('/vehicle/:id', ({ params }) => getRampDb().getVehicleReservations(params.id), {
    response: { 200: 'Reservations' },
    detail: { tags: ['Ramp'], summary: 'Vehicle reservations' },
  })
