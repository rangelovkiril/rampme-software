import { getVehicleReservations, type RampReservation } from '../db/ramp'

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

export function getVehicleRampInfo(vehicleId: string, hasRamp: boolean | null): VehicleRampInfo {
  if (hasRamp !== true) {
    return { ramp_status: 'unknown', reservations: [] }
  }

  const res = getVehicleReservations(vehicleId)
  const compact = res.map((r) => ({
    id: r.id,
    stop_id: r.stop_id,
    type: r.type,
    status: r.status as 'pending' | 'active',
  }))

  return {
    ramp_status: res.some((r) => r.status === 'active') ? 'in_use' : 'working',
    reservations: compact,
  }
}
