import { fetchTripUpdates, fetchVehiclePositions } from '../../gtfs/realtime'
import { normalizeGtfsHour, nowTotalMinutes, parseGtfsTime, unixToHHMM } from '../../gtfs/time'
import type { GtfsData } from '../../gtfs/types'

interface TripPrediction {
  arrival: number
  departure: number
}

interface TripPredictions {
  byStopId: Map<string, TripPrediction>
  byStopSequence: Map<number, TripPrediction>
  nextUpcomingSequence: number | null
}

const PAST_GRACE_MINUTES = 5
const WRAP_THRESHOLD_MINUTES = 12 * 60
const MAX_REASONABLE_FALLBACK_ETA_MINUTES = 6 * 60

export interface TripStopResult {
  stop_id: string
  stop_name: string
  stop_sequence: number
  scheduled_time: string
  expected_time: string | null
  eta_minutes: number | null
  status: 'departed' | 'delay' | 'on_time' | 'scheduled'
  delay_minutes: number
  realtime: boolean
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

export interface TripEtaUpdate {
  stop_id: string
  eta_minutes: number | null
  status: TripStopResult['status']
  expected_time: string | null
  delay_minutes: number
  realtime: boolean
}

/** Returns only the dynamic ETA fields for each stop — used by the SSE stream. */
export async function getTripEtas(
  data: GtfsData,
  vehicleId: string,
): Promise<TripEtaUpdate[] | null> {
  const feed = await fetchVehiclePositions()
  const entity = (feed.entity ?? []).find(
    (e: any) => (e.vehicle?.vehicle?.id ?? e.id) === vehicleId,
  )
  if (!entity?.vehicle) return null

  const tripId = entity.vehicle.trip?.tripId ?? ''
  if (!tripId) return null

  const tripStopTimes = data.stopTimesByTrip.get(tripId)
  if (!tripStopTimes || tripStopTimes.length === 0) return null
  const currentStopSequence = parseStopSequence(entity.vehicle.currentStopSequence)

  const nowSec = Math.floor(Date.now() / 1000)
  const predictions = await fetchTripPredictions(tripId, nowSec)

  return tripStopTimes.map((st) => {
    const r = buildTripStop(data, st, predictions, nowSec, currentStopSequence)
    return {
      stop_id: r.stop_id,
      eta_minutes: r.eta_minutes,
      status: r.status,
      expected_time: r.expected_time,
      delay_minutes: r.delay_minutes,
      realtime: r.realtime,
    }
  })
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
  const currentStopSequence = parseStopSequence(v.currentStopSequence)

  const nowSec = Math.floor(Date.now() / 1000)
  const predictions = await fetchTripPredictions(tripId, nowSec)

  const stops = tripStopTimes.map((st) =>
    buildTripStop(data, st, predictions, nowSec, currentStopSequence),
  )

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

async function fetchTripPredictions(tripId: string, nowSec: number): Promise<TripPredictions> {
  const tuFeed = await fetchTripUpdates().catch(() => ({ entity: [] }))
  const byStopId = new Map<string, TripPrediction>()
  const byStopSequence = new Map<number, TripPrediction>()
  let nextUpcomingSequence: number | null = null

  for (const e of (tuFeed as any).entity ?? []) {
    const tu = e.tripUpdate
    if (tu?.trip?.tripId !== tripId) continue
    for (const stu of tu.stopTimeUpdate ?? []) {
      const prediction: TripPrediction = {
        arrival: Number(stu.arrival?.time ?? 0),
        departure: Number(stu.departure?.time ?? 0),
      }

      const stopId = String(stu.stopId ?? '')
      if (stopId) byStopId.set(stopId, prediction)

      const stopSequence = Number(stu.stopSequence ?? 0)
      if (stopSequence > 0) {
        byStopSequence.set(stopSequence, prediction)
        const eventTs = prediction.arrival > 0 ? prediction.arrival : prediction.departure
        if (eventTs > nowSec) {
          if (nextUpcomingSequence === null || stopSequence < nextUpcomingSequence) {
            nextUpcomingSequence = stopSequence
          }
        }
      }
    }
    break
  }

  return { byStopId, byStopSequence, nextUpcomingSequence }
}

function buildTripStop(
  data: GtfsData,
  st: { stop_id: string; arrival_time: string; stop_sequence: number },
  predictions: TripPredictions,
  nowSec: number,
  currentStopSequence: number | null,
): TripStopResult {
  const stop = data.stops.get(st.stop_id)
  const predBySequence = predictions.byStopSequence.get(st.stop_sequence)
  const predById = predictions.byStopId.get(st.stop_id)

  // Prefer sequence-based predictions to avoid incorrect matches when a stop_id
  // appears multiple times in the same trip.
  const pred =
    predBySequence ??
    (predictions.nextUpcomingSequence !== null &&
    st.stop_sequence < predictions.nextUpcomingSequence
      ? undefined
      : predById)

  const { totalMinutes } = parseGtfsTime(st.arrival_time)
  const scheduledNorm = normalizeGtfsHour(st.arrival_time)

  let expected_time: string | null = null
  let eta_minutes: number | null = null
  let status: TripStopResult['status'] = 'scheduled'
  let delay_minutes = 0
  let realtime = false

  if (pred && pred.arrival > 0) {
    realtime = true
    expected_time = unixToHHMM(pred.arrival)

    if (pred.arrival <= nowSec) {
      status = 'departed'
      eta_minutes = 0
    } else {
      eta_minutes = Math.max(0, Math.round((pred.arrival - nowSec) / 60))
      const predDate = new Date(pred.arrival * 1000)
      const expectedTotalMin = predDate.getHours() * 60 + predDate.getMinutes()
      const scheduledProjected = projectGtfsMinutesNear(totalMinutes, expectedTotalMin)
      delay_minutes = expectedTotalMin - scheduledProjected
      if (delay_minutes > 720) delay_minutes -= 24 * 60
      if (delay_minutes < -720) delay_minutes += 24 * 60
      status = delay_minutes > 0 ? 'delay' : 'on_time'
    }
  } else {
    const definitelyPassedByVehicleSequence =
      currentStopSequence !== null && st.stop_sequence < currentStopSequence
    const definitelyPassedBySequence =
      predictions.nextUpcomingSequence !== null &&
      st.stop_sequence < predictions.nextUpcomingSequence

    if (definitelyPassedByVehicleSequence || definitelyPassedBySequence) {
      status = 'departed'
      eta_minutes = 0
    } else {
      const diff = computeScheduledEtaMinutes(totalMinutes, nowSec)
      if (diff === null) {
        status = 'departed'
        eta_minutes = 0
      } else {
        eta_minutes = diff
      }
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
    realtime,
  }
}

function computeScheduledEtaMinutes(totalGtfsMinutes: number, nowSec: number): number | null {
  const currentMinutes = nowTotalMinutes(new Date(nowSec * 1000))
  const day = 24 * 60
  const rawDiff = totalGtfsMinutes - currentMinutes

  // Normal same-day future stop.
  if (rawDiff >= 0 && rawDiff <= MAX_REASONABLE_FALLBACK_ETA_MINUTES) {
    return rawDiff
  }

  // Slightly past stop should be considered departed, not wrapped to +24h.
  if (rawDiff < 0 && rawDiff >= -PAST_GRACE_MINUTES) {
    return null
  }

  // Large negative diff likely means near-midnight wrap (e.g. 23:58 -> 00:07).
  if (rawDiff < -WRAP_THRESHOLD_MINUTES) {
    const wrapped = rawDiff + day
    if (wrapped >= 0 && wrapped <= MAX_REASONABLE_FALLBACK_ETA_MINUTES) {
      return wrapped
    }
    return null
  }

  // Large positive diff is usually a previous-day stop seen after midnight.
  if (rawDiff > WRAP_THRESHOLD_MINUTES) {
    return null
  }

  return rawDiff >= 0 ? rawDiff : null
}

function parseStopSequence(raw: unknown): number | null {
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) return null
  return Math.trunc(n)
}

function projectGtfsMinutesNear(totalGtfsMinutes: number, targetMinutes: number): number {
  const day = 24 * 60
  const candidates = [totalGtfsMinutes - day, totalGtfsMinutes, totalGtfsMinutes + day]

  let best = candidates[0]
  let bestDistance = Math.abs(candidates[0] - targetMinutes)

  for (let i = 1; i < candidates.length; i++) {
    const distance = Math.abs(candidates[i] - targetMinutes)
    if (distance < bestDistance) {
      best = candidates[i]
      bestDistance = distance
    }
  }

  return best
}
