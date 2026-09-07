import { describe, expect, test } from 'bun:test'
import type { RampReservation } from '../../../src/db/ramp'
import { getVehicleRampStatusFrom } from '../../../src/services/ramp/status'

function reservation(overrides: Partial<RampReservation> = {}): RampReservation {
  return {
    id: 1,
    session_id: 'sess-1',
    vehicle_id: 'A2053',
    stop_id: 'stopA',
    type: 'board',
    status: 'pending',
    created_at: 0,
    resolved_at: null,
    ...overrides,
  }
}

describe('getVehicleRampStatusFrom', () => {
  test('hasRamp null (unresolved) reports unknown', () => {
    const status = getVehicleRampStatusFrom([], null)
    expect(status).toBe('unknown')
  })

  test('hasRamp false (confirmed not equipped) reports no_ramp, distinct from unknown', () => {
    const status = getVehicleRampStatusFrom([], false)
    expect(status).toBe('no_ramp')
  })

  test('hasRamp true with no reservations reports working', () => {
    const status = getVehicleRampStatusFrom([], true)
    expect(status).toBe('working')
  })

  test('hasRamp true with a pending reservation still reports working', () => {
    const status = getVehicleRampStatusFrom([reservation({ status: 'pending' })], true)
    expect(status).toBe('working')
  })

  test('hasRamp true with an active reservation reports in_use', () => {
    const status = getVehicleRampStatusFrom([reservation({ status: 'active' })], true)
    expect(status).toBe('in_use')
  })

  test('confirmed-not-equipped wins over an active reservation', () => {
    const status = getVehicleRampStatusFrom([reservation({ status: 'active' })], false)
    expect(status).toBe('no_ramp')
  })
})
