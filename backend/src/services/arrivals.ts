import { config } from '../config'
import { fetchTripUpdates } from '../gtfs/realtime'
import { activeServiceIds } from '../gtfs/services'
import {
  normalizeGtfsHour,
  nowHHMMSS,
  nowTotalMinutes,
  parseGtfsTime,
  unixToHHMM,
} from '../gtfs/time'
import type { GtfsData } from '../gtfs/types'

export interface ArrivalResult {
  id: string
  route_short_name: string | null
  route_type: number | null
  headsign: string | null
  route_id: string | null
  scheduled_time: string | null
  expected_time: string | null
  eta_minutes: number
  realtime: boolean
  has_ramp: boolean
}

interface ScheduledArrival {
  trip_id: string
  arrival_time: string
  stop_id: string
}

/**
 * Computes upcoming arrivals at a stop (and its siblings),
 * merging static GTFS schedule with realtime trip-update predictions.
 */
export async function getUpcomingArrivals(
  data: GtfsData,
  stopId: string,
  limit: number,
): Promise<ArrivalResult[]> {
  const stop = data.stops.get(stopId)
  if (!stop) return []

  const siblingIds = stop.stop_code ? (data.stopsByCode.get(stop.stop_code) ?? [stopId]) : [stopId]

  const now = new Date()
  const services = activeServiceIds(data.calendarDates, now)
  const currentTime = nowHHMMSS(now)
  const nowSec = Math.floor(now.getTime() / 1000)

  const scheduled = collectScheduledArrivals(data, siblingIds, services, currentTime)
  const predictions = await collectPredictions(siblingIds, nowSec, scheduled)
  const currentMinutes = nowTotalMinutes(now)

  const results = scheduled.map((sa) => {
    const trip = data.trips.get(sa.trip_id)
    const route = trip ? data.routes.get(trip.route_id) : undefined

    const prediction = predictions.get(sa.trip_id)
    let eta_minutes: number
    let expected_time: string | null = null

    if (prediction) {
      eta_minutes = Math.max(0, Math.round((prediction - nowSec) / 60))
      expected_time = unixToHHMM(prediction)
    } else {
      const { totalMinutes } = parseGtfsTime(sa.arrival_time)
      eta_minutes = Math.max(0, totalMinutes - currentMinutes)
      expected_time = sa.arrival_time ? normalizeGtfsHour(sa.arrival_time) : null
    }

    return {
      id: sa.trip_id,
      route_short_name: route?.route_short_name ?? null,
      route_type: route?.route_type ?? null,
      headsign: trip?.trip_headsign ?? null,
      route_id: trip?.route_id ?? null,
      scheduled_time: sa.arrival_time ? normalizeGtfsHour(sa.arrival_time) : null,
      expected_time,
      eta_minutes,
      realtime: Boolean(prediction),
      has_ramp: config.rampAll ? true : trip?.wheelchair_accessible === 1,
    }
  })

  return deduplicateAndSort(results, limit)
}

function collectScheduledArrivals(
  data: GtfsData,
  siblingIds: string[],
  services: Set<string>,
  currentTime: string,
): ScheduledArrival[] {
  const arrivals: ScheduledArrival[] = []
  for (const sid of siblingIds) {
    const times = data.stopTimesByStop.get(sid)
    if (!times) continue
    for (const st of times) {
      const trip = data.trips.get(st.trip_id)
      if (!trip || !services.has(trip.service_id)) continue
      if (st.arrival_time >= currentTime) {
        arrivals.push({ trip_id: st.trip_id, arrival_time: st.arrival_time, stop_id: st.stop_id })
      }
    }
  }
  return arrivals
}

async function collectPredictions(
  siblingIds: string[],
  nowSec: number,
  scheduled: ScheduledArrival[],
): Promise<Map<string, number>> {
  const tuFeed = await fetchTripUpdates().catch(() => ({ entity: [] }))
  const siblingSet = new Set(siblingIds)
  const predictions = new Map<string, number>()

  for (const e of (tuFeed as any).entity ?? []) {
    const tu = e.tripUpdate
    if (!tu?.stopTimeUpdate) continue
    const tripId = tu.trip?.tripId ?? ''
    for (const stu of tu.stopTimeUpdate) {
      if (siblingSet.has(stu.stopId)) {
        const arrTime = Number(stu.arrival?.time ?? stu.departure?.time ?? 0)
        if (arrTime > nowSec) {
          predictions.set(tripId, arrTime)
          if (!scheduled.some((sa) => sa.trip_id === tripId)) {
            scheduled.push({ trip_id: tripId, arrival_time: '', stop_id: stu.stopId })
          }
        }
        break
      }
    }
  }

  return predictions
}

function deduplicateAndSort(results: ArrivalResult[], limit: number): ArrivalResult[] {
  const seen = new Set<string>()
  return results
    .filter((r) => {
      if (seen.has(r.id)) return false
      seen.add(r.id)
      return true
    })
    .sort((a, b) => a.eta_minutes - b.eta_minutes)
    .slice(0, limit)
}
