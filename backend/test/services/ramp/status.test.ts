import { describe, expect, test } from 'bun:test'
import type { RampReservation } from '../../../src/db/ramp'
import { getVehicleRampInfoFrom } from '../../../src/services/ramp/status'

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

describe('getVehicleRampInfoFrom', () => {
  test('hasRamp null (unresolved) reports unknown', () => {
    const info = getVehicleRampInfoFrom([], null)
    expect(info.ramp_status).toBe('unknown')
    expect(info.reservations).toEqual([])
  })

  test('hasRamp false (confirmed not equipped) reports no_ramp, distinct from unknown', () => {
    const info = getVehicleRampInfoFrom([], false)
    expect(info.ramp_status).toBe('no_ramp')
    expect(info.reservations).toEqual([])
  })

  test('hasRamp true with no reservations reports working', () => {
    const info = getVehicleRampInfoFrom([], true)
    expect(info.ramp_status).toBe('working')
  })

  test('hasRamp true with a pending reservation still reports working', () => {
    const info = getVehicleRampInfoFrom([reservation({ status: 'pending' })], true)
    expect(info.ramp_status).toBe('working')
    expect(info.reservations).toHaveLength(1)
  })

  test('hasRamp true with an active reservation reports in_use', () => {
    const info = getVehicleRampInfoFrom([reservation({ status: 'active' })], true)
    expect(info.ramp_status).toBe('in_use')
  })

  test('a no_ramp or unknown vehicle never carries reservations, even if some exist', () => {
    const info = getVehicleRampInfoFrom([reservation({ status: 'active' })], false)
    expect(info.ramp_status).toBe('no_ramp')
    expect(info.reservations).toEqual([])
  })
})
