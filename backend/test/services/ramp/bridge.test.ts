import { describe, expect, test } from 'bun:test'
import type { RampReservation } from '../../../src/db/ramp'
import { createRampBridge, type RampMqtt } from '../../../src/services/ramp/bridge'

function reservation(overrides: Partial<RampReservation> = {}): RampReservation {
  return {
    id: 1,
    session_id: 'sess-1',
    vehicle_id: 'bus1',
    stop_id: 'stopA',
    type: 'board',
    status: 'pending',
    created_at: 0,
    resolved_at: null,
    ...overrides,
  }
}

/** A fake RampMqtt that records publishes and lets a test push hardware-state messages by hand. */
function fakeMqtt() {
  const published: Array<{ topic: string; payload: unknown }> = []
  const handlers: Array<(topic: string, payload: unknown) => void> = []
  const mqtt: RampMqtt = {
    publish(topic, payload) {
      published.push({ topic, payload })
    },
    on(_pattern, _parse, handler) {
      handlers.push(handler as (topic: string, payload: unknown) => void)
      return () => {}
    },
  }
  return {
    mqtt,
    published,
    emit(topic: string, payload: unknown) {
      for (const h of handlers) h(topic, payload)
    },
  }
}

describe('createRampBridge', () => {
  test('publishNewReservation/publishCancelReservation publish to the vehicle cmd topic', () => {
    const { mqtt, published } = fakeMqtt()
    const bridge = createRampBridge(mqtt, 50)

    bridge.publishNewReservation(reservation({ id: 1 }))
    bridge.publishCancelReservation(reservation({ id: 1, status: 'cancelled' }))

    expect(published).toEqual([
      { topic: 'ramp/bus1/cmd', payload: { action: 'new_reservation', id: 1 } },
      { topic: 'ramp/bus1/cmd', payload: { action: 'cancel_reservation', id: 1 } },
    ])
  })

  test('deploy-tracking state is isolated per instance, not shared module-level state', () => {
    const a = createRampBridge(fakeMqtt().mqtt, 50)
    const b = createRampBridge(fakeMqtt().mqtt, 50)

    a.markDeployTriggered('bus1', 'stopA')

    expect(a.isDeployInFlight('bus1')).toBe(true)
    expect(b.isDeployInFlight('bus1')).toBe(false)
  })

  test('a "deploying" ack cancels the deploy-timeout before it can fire', async () => {
    const { mqtt, published, emit } = fakeMqtt()
    const bridge = createRampBridge(mqtt, 20)

    bridge.subscribeToHardwareStates()
    bridge.publishDeploy('bus1')
    emit('ramp/bus1/state', { state: 'deploying' })

    // Wait past the (short, test-only) timeout — if the ack hadn't cancelled
    // it, this would touch the reservations db, which this test never sets up.
    await new Promise((r) => setTimeout(r, 40))

    expect(published).toEqual([{ topic: 'ramp/bus1/cmd', payload: { action: 'deploy' } }])
  })

  test('an invalid hardware-state payload is ignored instead of throwing', () => {
    const { mqtt, emit } = fakeMqtt()
    const bridge = createRampBridge(mqtt, 50)
    bridge.subscribeToHardwareStates()

    expect(() => emit('ramp/bus1/state', { state: 'not-a-real-state' })).not.toThrow()
  })
})
