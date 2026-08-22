import { getAllActiveReservations, type RampReservation } from '../../db/ramp'

export type RampStatus = 'unknown' | 'working' | 'in_use'

export interface VehicleRampInfo {
  ramp_status: RampStatus
  reservations: Array<{
    id: number
    stop_id: string
    type: 'board' | 'alight'
    status: 'pending' | 'active'
  }>
}

export function getVehicleRampInfoFrom(
  reservations: RampReservation[],
  hasRamp: boolean | null,
): VehicleRampInfo {
  if (hasRamp !== true) {
    return { ramp_status: 'unknown', reservations: [] }
  }

  const compact = reservations.map((r) => ({
    id: r.id,
    stop_id: r.stop_id,
    type: r.type,
    status: r.status as 'pending' | 'active',
  }))

  return {
    ramp_status: reservations.some((r) => r.status === 'active') ? 'in_use' : 'working',
    reservations: compact,
  }
}

export function getReservationsByVehicle(): Map<string, RampReservation[]> {
  const map = new Map<string, RampReservation[]>()
  for (const r of getAllActiveReservations()) {
    const list = map.get(r.vehicle_id)
    if (list) list.push(r)
    else map.set(r.vehicle_id, [r])
  }
  return map
}
