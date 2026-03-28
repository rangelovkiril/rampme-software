import { hasMockRamp } from '../services/mock-ramp'
import { getVehicleRampInfo, type RampStatus } from '../services/ramp'
import type { GtfsData } from './types'

export interface EnrichedVehicle {
  id: string
  tripId: string
  lat: number
  lng: number
  bearing: number | null
  speed: number | null
  route_id: string | null
  route_short_name: string | null
  route_type: number | null
  headsign: string | null
  label: string | null
  ramp_status: RampStatus
  ramp_reservations: Array<{
    id: number
    stop_id: string
    type: 'board' | 'alight'
    status: 'pending' | 'active'
  }>
}

export function enrichVehicles(entities: any[], data: GtfsData): EnrichedVehicle[] {
  return entities
    .filter((e) => e.vehicle?.position)
    .map((e) => {
      const v = e.vehicle
      const pos = v.position
      const tripId = v.trip?.tripId ?? ''
      const rawRouteId = v.trip?.routeId ?? ''
      const trip = data.trips.get(tripId)
      const routeId = trip?.route_id ?? rawRouteId
      const route = routeId ? data.routes.get(routeId) : undefined
      const vehicleId = v.vehicle?.id ?? e.id
      const ramp = getVehicleRampInfo(vehicleId, hasMockRamp(vehicleId))

      return {
        id: vehicleId,
        tripId,
        lat: pos.latitude,
        lng: pos.longitude,
        bearing: pos.bearing ?? null,
        speed: pos.speed ?? null,
        route_id: routeId || null,
        route_short_name: route?.route_short_name ?? null,
        route_type: route?.route_type ?? null,
        headsign: trip?.trip_headsign ?? null,
        label: v.vehicle?.label ?? null,
        ramp_status: ramp.ramp_status,
        ramp_reservations: ramp.reservations,
      }
    })
}
