import { getVehicleExtra } from '../db/vehicles'
import type { GtfsData } from './types'

export function enrichVehicles(entities: any[], data: GtfsData) {
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
      const extra = getVehicleExtra(v.vehicle?.id ?? '')

      return {
        id: v.vehicle?.id ?? e.id,
        tripId,
        lat: pos.latitude,
        lng: pos.longitude,
        bearing: pos.bearing ?? null,
        speed: pos.speed ?? null,
        route_id: routeId || null,
        route_short_name: route?.route_short_name ?? null,
        route_type: route?.route_type ?? null,
        headsign: trip?.trip_headsign ?? null,
        low_floor: extra?.low_floor ?? null,
      }
    })
}
