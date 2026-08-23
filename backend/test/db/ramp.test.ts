import { describe, expect, test } from 'bun:test'
import { createRampDb, type RampReservation } from '../../src/db/ramp'

function reserve(
  db: ReturnType<typeof createRampDb>,
  overrides: Partial<{
    sessionId: string
    vehicleId: string
    stopId: string
    type: 'board' | 'alight'
  }> = {},
) {
  return db.createReservation(
    overrides.sessionId ?? 'sess-1',
    overrides.vehicleId ?? 'bus1',
    overrides.stopId ?? 'stopA',
    overrides.type ?? 'board',
  )
}

describe('createRampDb', () => {
  test('pending → active → done lifecycle', () => {
    const db = createRampDb(':memory:')
    const r = reserve(db) as RampReservation
    expect(r.status).toBe('pending')

    db.setReservationStatus(r.id, 'active')
    let [current] = db.getSessionReservations('sess-1')
    expect(current?.status).toBe('active')
    expect(current?.resolved_at).toBeNull()

    db.setReservationStatus(r.id, 'done')
    ;[current] = db.getSessionReservations('sess-1')
    expect(current?.status).toBe('done')
    expect(current?.resolved_at).not.toBeNull()
  })

  test('cancelReservation moves a pending reservation to cancelled', () => {
    const db = createRampDb(':memory:')
    const r = reserve(db) as RampReservation

    const cancelled = db.cancelReservation(r.id, 'sess-1')
    expect(cancelled?.id).toBe(r.id)
    expect(cancelled?.status).toBe('pending') // returns the pre-cancel snapshot

    const [current] = db.getSessionReservations('sess-1')
    expect(current?.status).toBe('cancelled')
    expect(current?.resolved_at).not.toBeNull()
  })

  test('cancelReservation on an already-resolved reservation is a no-op', () => {
    const db = createRampDb(':memory:')
    const r = reserve(db) as RampReservation
    db.setReservationStatus(r.id, 'expired')

    expect(db.cancelReservation(r.id, 'sess-1')).toBeNull()
  })

  test('setReservationStatus can expire a reservation directly (proximity-checker path)', () => {
    const db = createRampDb(':memory:')
    const r = reserve(db) as RampReservation

    db.setReservationStatus(r.id, 'expired')

    const [current] = db.getSessionReservations('sess-1')
    expect(current?.status).toBe('expired')
    expect(current?.resolved_at).not.toBeNull()
  })

  test('MAX_ACTIVE caps a session to 2 concurrent pending/active reservations', () => {
    const db = createRampDb(':memory:')
    const first = reserve(db, { vehicleId: 'bus1', stopId: 'stopA' })
    const second = reserve(db, { vehicleId: 'bus2', stopId: 'stopB' })
    expect('error' in first).toBe(false)
    expect('error' in second).toBe(false)

    const third = reserve(db, { vehicleId: 'bus3', stopId: 'stopC' })
    expect(third).toEqual({ error: 'Max 2 active reservations' })
  })

  test('a resolved reservation does not count against the MAX_ACTIVE cap', () => {
    const db = createRampDb(':memory:')
    const first = reserve(db, { vehicleId: 'bus1', stopId: 'stopA' }) as RampReservation
    reserve(db, { vehicleId: 'bus2', stopId: 'stopB' })
    db.setReservationStatus(first.id, 'done')

    const third = reserve(db, { vehicleId: 'bus3', stopId: 'stopC' })
    expect('error' in third).toBe(false)
  })

  test('rejects a duplicate pending reservation for the same session/vehicle/stop/type', () => {
    const db = createRampDb(':memory:')
    const first = reserve(db)
    expect('error' in first).toBe(false)

    const duplicate = reserve(db)
    expect(duplicate).toEqual({ error: 'Already reserved' })
  })

  test("cancelReservation enforces session ownership — one session cannot cancel another session's reservation", () => {
    const db = createRampDb(':memory:')
    const r = reserve(db, { sessionId: 'sess-owner' }) as RampReservation

    expect(db.cancelReservation(r.id, 'sess-intruder')).toBeNull()

    // Still pending — the intruder's attempt didn't change anything.
    const [current] = db.getSessionReservations('sess-owner')
    expect(current?.status).toBe('pending')

    const cancelled = db.cancelReservation(r.id, 'sess-owner')
    expect(cancelled?.id).toBe(r.id)
  })

  test('getVehicleReservations only returns pending/active reservations for that vehicle', () => {
    const db = createRampDb(':memory:')
    const r = reserve(db, { vehicleId: 'bus1', stopId: 'stopA' }) as RampReservation
    reserve(db, { vehicleId: 'bus2', stopId: 'stopB' })
    db.setReservationStatus(r.id, 'done')

    expect(db.getVehicleReservations('bus1')).toEqual([])
    expect(db.getVehicleReservations('bus2')).toHaveLength(1)
  })

  test('getAllActiveReservations only returns pending/active reservations across all sessions', () => {
    const db = createRampDb(':memory:')
    const a = reserve(db, {
      sessionId: 'sess-1',
      vehicleId: 'bus1',
      stopId: 'stopA',
    }) as RampReservation
    reserve(db, { sessionId: 'sess-2', vehicleId: 'bus2', stopId: 'stopB' })
    db.setReservationStatus(a.id, 'cancelled')

    const active = db.getAllActiveReservations()
    expect(active).toHaveLength(1)
    expect(active[0]?.vehicle_id).toBe('bus2')
  })
})
