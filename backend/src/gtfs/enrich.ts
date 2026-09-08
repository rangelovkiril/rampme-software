import type { RampReservation } from '../db/ramp'
import type { EnrichedVehicle } from '../schemas'
import { getVehicleRampStatusFrom } from '../services/ramp/status'
import type { GtfsData, GtfsRtFeedEntity, GtfsRtPosition, GtfsRtVehiclePosition } from './types'

type EntityWithPosition = GtfsRtFeedEntity & {
  vehicle: GtfsRtVehiclePosition & { position: GtfsRtPosition }
}

function hasPosition(e: GtfsRtFeedEntity): e is EntityWithPosition {
  return e.vehicle?.position != null
}

export function enrichVehicles(
  entities: GtfsRtFeedEntity[],
  data: GtfsData,
  reservationsByVehicle: Map<string, RampReservation[]>,
  resolveAccessibility: (vehicleId: string) => boolean | null,
): EnrichedVehicle[] {
  return entities.filter(hasPosition).map((e) => {
    const v = e.vehicle
    const pos = v.position
    const tripId = v.trip?.tripId ?? ''
    const rawRouteId = v.trip?.routeId ?? ''
    const trip = data.trips.get(tripId)
    const routeId = trip?.route_id ?? rawRouteId
    const route = routeId ? data.routes.get(routeId) : undefined
    const vehicleId = v.vehicle?.id ?? e.id
    const hasRamp = resolveAccessibility(vehicleId)
    const ramp_status = getVehicleRampStatusFrom(
      reservationsByVehicle.get(vehicleId) ?? [],
      hasRamp,
    )

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
      ramp_status,
    }
  })
}
