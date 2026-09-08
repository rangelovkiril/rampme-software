import { getRampDb, type RampReservation } from '../../db/ramp'

// 'unknown' and 'no_ramp' are both ramp-absent-from-a-reservation's-perspective
// (neither can ever carry a reservation), but they are not the same fact:
// 'no_ramp' means the vehicle is confirmed not equipped, 'unknown' means its
// equipment couldn't be resolved. Collapsing them back into one value would
// undo the accessibility feature's whole point — see
// openspec/changes/ramp-vehicle-accessibility's "Three distinguishable
// accessibility states" requirement.
export type { RampStatus } from '../../schemas'

import type { RampStatus } from '../../schemas'

export function getVehicleRampStatusFrom(
  reservations: RampReservation[],
  hasRamp: boolean | null,
): RampStatus {
  if (hasRamp === null) return 'unknown'
  if (hasRamp === false) return 'no_ramp'
  return reservations.some((r) => r.status === 'active') ? 'in_use' : 'working'
}

export function getReservationsByVehicle(): Map<string, RampReservation[]> {
  const map = new Map<string, RampReservation[]>()
  for (const r of getRampDb().getAllActiveReservations()) {
    const list = map.get(r.vehicle_id)
    if (list) list.push(r)
    else map.set(r.vehicle_id, [r])
  }
  return map
}
