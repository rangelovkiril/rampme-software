import { describe, expect, test } from 'bun:test'
import { initRampDb } from '../../src/db/ramp'
import { rampRoutes } from '../../src/routes/ramp'

// No initRampBridge() call anywhere in this file — isRampBridgeAvailable() stays
// false throughout, exercising the exact "no hardware bridge" path from issue #69.
initRampDb(':memory:')

function reserve(vehicleId: string, stopId: string, sessionId: string) {
  return rampRoutes.handle(
    new Request('http://localhost/ramp/reserve', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-session-id': sessionId },
      body: JSON.stringify({ vehicle_id: vehicleId, stop_id: stopId, type: 'board' }),
    }),
  )
}

function sessionReservations(sessionId: string) {
  return rampRoutes
    .handle(
      new Request('http://localhost/ramp/session', { headers: { 'x-session-id': sessionId } }),
    )
    .then((res) => res.json())
}

describe('ramp routes without a hardware bridge (MQTT_URL unset)', () => {
  test('POST /ramp/reserve succeeds and the reservation is retrievable afterward', async () => {
    const sessionId = 'sess-route-test-reserve'
    const res = await reserve('bus1', 'stopA', sessionId)

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe('pending')

    const session = await sessionReservations(sessionId)
    expect(session).toEqual([body])
  })

  test("DELETE /ramp/reserve/:id succeeds and the reservation's status is recorded as cancelled", async () => {
    const sessionId = 'sess-route-test-cancel'
    const created = await reserve('bus2', 'stopB', sessionId).then((res) => res.json())

    const res = await rampRoutes.handle(
      new Request(`http://localhost/ramp/reserve/${created.id}`, {
        method: 'DELETE',
        headers: { 'x-session-id': sessionId },
      }),
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })

    const [current] = await sessionReservations(sessionId)
    expect(current?.status).toBe('cancelled')
  })
})
