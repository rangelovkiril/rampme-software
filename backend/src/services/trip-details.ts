import { fetchTripUpdates, fetchVehiclePositions } from '../gtfs/realtime'
import { normalizeGtfsHour, nowTotalMinutes, parseGtfsTime, unixToHHMM } from '../gtfs/time'
import type { GtfsData } from '../gtfs/types'

export interface TripStopResult {
  stop_id: string
  stop_name: string
  stop_sequence: number
  scheduled_time: string
  expected_time: string | null
  eta_minutes: number | null
  status: 'departed' | 'delay' | 'on_time' | 'scheduled'
  delay_minutes: number
}

export interface TripDetailResult {
  vehicle_id: string
  trip_id: string
  route_id: string
  route_short_name: string | null
  route_type: number | null
  headsign: string | null
  stops: TripStopResult[]
}

/**
 * Fetches the current trip for a vehicle, including all stop times
 * enriched with realtime predictions.
 */
export async function getVehicleTripDetails(
  data: GtfsData,
  vehicleId: string,
): Promise<TripDetailResult | null> {
  const feed = await fetchVehiclePositions()
  const entity = (feed.entity ?? []).find(
    (e: any) => (e.vehicle?.vehicle?.id ?? e.id) === vehicleId,
  )
  if (!entity?.vehicle) return null

  const v = entity.vehicle
  const tripId = v.trip?.tripId ?? ''
  if (!tripId) return null

  const trip = data.trips.get(tripId)
  const routeId = trip?.route_id ?? v.trip?.routeId ?? ''
  const route = routeId ? data.routes.get(routeId) : undefined

  const tripStopTimes = data.stopTimesByTrip.get(tripId)
  if (!tripStopTimes || tripStopTimes.length === 0) return null

  const predictions = await fetchTripPredictions(tripId)
  const nowSec = Math.floor(Date.now() / 1000)

  const stops = tripStopTimes.map((st) => buildTripStop(data, st, predictions, nowSec))

  return {
    vehicle_id: vehicleId,
    trip_id: tripId,
    route_id: routeId,
    route_short_name: route?.route_short_name ?? null,
    route_type: route?.route_type ?? null,
    headsign: trip?.trip_headsign ?? null,
    stops,
  }
}

async function fetchTripPredictions(
  tripId: string,
): Promise<Map<string, { arrival: number; departure: number }>> {
  const tuFeed = await fetchTripUpdates().catch(() => ({ entity: [] }))
  const predictions = new Map<string, { arrival: number; departure: number }>()

  for (const e of (tuFeed as any).entity ?? []) {
    const tu = e.tripUpdate
    if (tu?.trip?.tripId !== tripId) continue
    for (const stu of tu.stopTimeUpdate ?? []) {
      predictions.set(stu.stopId, {
        arrival: Number(stu.arrival?.time ?? 0),
        departure: Number(stu.departure?.time ?? 0),
      })
    }
    break
  }

  return predictions
}

function buildTripStop(
  data: GtfsData,
  st: { stop_id: string; arrival_time: string; stop_sequence: number },
  predictions: Map<string, { arrival: number; departure: number }>,
  nowSec: number,
): TripStopResult {
  const stop = data.stops.get(st.stop_id)
  const pred = predictions.get(st.stop_id)
  const { hours, minutes } = parseGtfsTime(st.arrival_time)
  const scheduledNorm = normalizeGtfsHour(st.arrival_time)
  const normH = hours % 24

  let expected_time: string | null = null
  let eta_minutes: number | null = null
  let status: TripStopResult['status'] = 'scheduled'
  let delay_minutes = 0

  if (pred && pred.arrival > 0) {
    expected_time = unixToHHMM(pred.arrival)

    if (pred.arrival <= nowSec) {
      status = 'departed'
      eta_minutes = 0
    } else {
      eta_minutes = Math.max(0, Math.round((pred.arrival - nowSec) / 60))
      const scheduledTotalMin = normH * 60 + minutes
      const predDate = new Date(pred.arrival * 1000)
      const expectedTotalMin = predDate.getHours() * 60 + predDate.getMinutes()
      delay_minutes = expectedTotalMin - scheduledTotalMin
      status = delay_minutes > 0 ? 'delay' : 'on_time'
    }
  } else {
    const scheduledTotalMin = normH * 60 + minutes
    const currentMinutes = nowTotalMinutes()
    const diff = scheduledTotalMin - currentMinutes
    if (diff < -2) {
      status = 'departed'
      eta_minutes = 0
    } else {
      eta_minutes = Math.max(0, diff)
    }
    expected_time = scheduledNorm
  }

  return {
    stop_id: st.stop_id,
    stop_name: stop?.stop_name ?? st.stop_id,
    stop_sequence: st.stop_sequence,
    scheduled_time: scheduledNorm,
    expected_time,
    eta_minutes,
    status,
    delay_minutes,
  }
}
