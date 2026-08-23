import { describe, expect, test } from 'bun:test'
import { computeRampUpdate } from './ramp-updates'
import type { RampReservation } from './types'

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

describe('computeRampUpdate', () => {
  test('pending → active logs a bus-arrived line, no missed-bus alert', () => {
    const prev = [reservation({ status: 'pending' })]
    const curr = [reservation({ status: 'active' })]

    const update = computeRampUpdate(prev, curr)

    expect(update.missedBusMessage).toBeNull()
    expect(update.logs).toEqual([
      '[ramp] bus arrived at stop — board reservation #1 is now ACTIVE (vehicle bus1, stop stopA)',
    ])
  })

  test('pending/active → expired surfaces a missed-bus alert', () => {
    const prev = [reservation({ status: 'active' })]
    const curr = [reservation({ status: 'expired' })]

    const update = computeRampUpdate(prev, curr)

    expect(update.missedBusMessage).toBe('Автобусът замина без да разгъне рампата.')
  })

  test('a reservation disappearing while pending/active is logged, not alerted', () => {
    const prev = [reservation({ status: 'pending' })]
    const update = computeRampUpdate(prev, [])

    expect(update.missedBusMessage).toBeNull()
    expect(update.logs).toEqual(['[ramp] reservation #1 removed (board, vehicle bus1)'])
  })

  test('a pending/active board reservation locks its vehicle', () => {
    const curr = [reservation({ vehicle_id: 'bus2', status: 'pending' })]
    expect(computeRampUpdate([], curr).lockedVehicleId).toBe('bus2')
  })

  test('no active board or alight reservation clears the locked route', () => {
    const curr = [reservation({ status: 'done' })]
    expect(computeRampUpdate([], curr).clearLockedRoute).toBe(true)
  })

  test('an active alight reservation keeps the locked route even without a board', () => {
    const curr = [reservation({ type: 'alight', status: 'active' })]
    expect(computeRampUpdate([], curr).clearLockedRoute).toBe(false)
  })

  test('unrelated fields changing without a status change produce no logs', () => {
    const prev = [reservation({ status: 'pending' })]
    const curr = [reservation({ status: 'pending', resolved_at: 123 })]
    expect(computeRampUpdate(prev, curr).logs).toEqual([])
  })
})
