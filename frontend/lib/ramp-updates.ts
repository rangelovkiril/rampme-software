import type { RampReservation } from './types'

export interface RampUpdate {
  reservations: RampReservation[]
  lockedVehicleId: string | null
  clearLockedRoute: boolean
  missedBusMessage: string | null
  logs: string[]
}

/**
 * Pure diff between the previous and freshly-pushed reservation list.
 * Detects status transitions driven by the hardware/proximity side
 * (pending → active, active → done, → expired) — those never go through
 * reserveBoard/reserveAlight/cancel, so this diff is the only place they
 * surface. Kept side-effect free so it can be unit tested without mounting
 * RampProvider or mocking SSE; the caller applies the result to React state.
 */
export function computeRampUpdate(prev: RampReservation[], curr: RampReservation[]): RampUpdate {
  const logs: string[] = []
  let missedBusMessage: string | null = null

  for (const p of prev) {
    const c = curr.find((r) => r.id === p.id)
    if (c && c.status !== p.status) {
      if (c.status === 'active') {
        logs.push(
          `[ramp] bus arrived at stop — ${p.type} reservation #${p.id} is now ACTIVE (vehicle ${p.vehicle_id}, stop ${p.stop_id})`,
        )
      } else if (c.status === 'done') {
        logs.push(
          `[ramp] ramp used — ${p.type} reservation #${p.id} DONE (vehicle ${p.vehicle_id}, stop ${p.stop_id})`,
        )
      } else if (c.status === 'expired') {
        missedBusMessage = 'Автобусът замина без да разгъне рампата.'
      }
    }
    // Reservation disappeared from active list (removed server-side)
    if (!c && (p.status === 'pending' || p.status === 'active')) {
      logs.push(`[ramp] reservation #${p.id} removed (${p.type}, vehicle ${p.vehicle_id})`)
    }
  }

  const board = curr.find(
    (r) => r.type === 'board' && (r.status === 'pending' || r.status === 'active'),
  )
  const hasActiveAlight = curr.some(
    (r) => r.type === 'alight' && (r.status === 'pending' || r.status === 'active'),
  )

  return {
    reservations: curr,
    lockedVehicleId: board?.vehicle_id ?? null,
    clearLockedRoute: !board && !hasActiveAlight,
    missedBusMessage,
    logs,
  }
}
