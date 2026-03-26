import cors from '@elysiajs/cors'
import { Elysia, t } from 'elysia'
import { config } from './config'
import { getVehicleExtra } from './db/vehicles'
import { fetchTripUpdates, fetchVehiclePositions } from './gtfs/realtime'
import { fetchStaticGtfs } from './gtfs/static'
import type { GtfsData } from './gtfs/types'
import { swaggerPlugin } from './swagger'

let gtfs: GtfsData | undefined

function jsonError(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}


const GTFS_NOT_READY = () => jsonError('GTFS data not yet loaded', 503)

async function initGtfs() {
  try {
    gtfs = await fetchStaticGtfs()
  } catch (e) {
    console.error('Failed to load GTFS static data:', e)
    if (!gtfs) console.error('Server starting without GTFS data — static endpoints will return 503')
  }
}

/** Enrich raw vehicle entities with GTFS static data and local DB extras */
function enrichVehicles(entities: any[], data: GtfsData) {
  return entities
    .filter((e) => e.vehicle?.position)
    .map((e) => {
      const v = e.vehicle
      const pos = v.position
      const tripId = v.trip?.tripId ?? ''
      const rawRouteId = v.trip?.routeId ?? ''
      const trip = data.trips.get(tripId)
      // Use route from static trip if available, otherwise fall back to routeId from the RT feed
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

const app = new Elysia()
  .use(swaggerPlugin)
  .use(cors())

  .get(
    '/stops',
    () => {
      const data = gtfs
      if (!data) return GTFS_NOT_READY()
      return [...data.stops.values()]
    },
    { detail: { tags: ['Stops'], summary: 'All stops' } },
  )

  .get(
    '/stops/:id',
    ({ params: { id } }) => {
      const data = gtfs
      if (!data) return GTFS_NOT_READY()
      try {
        const stop = data.stops.get(id)
        if (!stop) return jsonError('Stop not found', 404)
        return stop
      } catch (e) {
        return jsonError(`Failed to retrieve stop: ${e}`, 500)
      }
    },
    { detail: { tags: ['Stops'], summary: 'Stop by ID' } },
  )

  .get(
    '/stops/:id/vehicles',
    async ({ params: { id }, query }) => {
      const data = gtfs
      if (!data) return GTFS_NOT_READY()
      try {
        const stop = data.stops.get(id)
        if (!stop) return jsonError('Stop not found', 404)

        const rawLimit = Number(query.limit ?? '20')
        const limit = Number.isFinite(rawLimit)
          ? Math.min(Math.max(Math.trunc(rawLimit), 1), 50)
          : 20

        // Find sibling stops (same physical stop, different transport types: A2795, TB2795, TM2795)
        const siblingIds = stop.stop_code ? (data.stopsByCode.get(stop.stop_code) ?? [id]) : [id]

        // Determine today's active service IDs
        const now = new Date()
        const todayStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
        const activeServices = new Set(
          data.calendarDates.filter((cd) => cd.date === todayStr && cd.exception_type === 1).map((cd) => cd.service_id),
        )

        // Current time as "HH:MM:SS" for schedule comparison
        const nowHHMMSS = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`
        const nowSec = Math.floor(now.getTime() / 1000)

        // Collect all scheduled stop_times for sibling stops
        const scheduledArrivals: { trip_id: string; arrival_time: string; stop_id: string }[] = []
        for (const sid of siblingIds) {
          const times = data.stopTimesByStop.get(sid)
          if (!times) continue
          for (const st of times) {
            // Only include trips running today and arriving in the future
            const trip = data.trips.get(st.trip_id)
            if (!trip || !activeServices.has(trip.service_id)) continue
            if (st.arrival_time >= nowHHMMSS) {
              scheduledArrivals.push({ trip_id: st.trip_id, arrival_time: st.arrival_time, stop_id: st.stop_id })
            }
          }
        }

        // Fetch trip-updates for real-time predicted arrival times
        const tuFeed = await fetchTripUpdates().catch(() => ({ entity: [] }))

        // Build lookup: tripId → predicted arrival unix timestamp at any sibling stop
        const siblingSet = new Set(siblingIds)
        const tripPredictions = new Map<string, number>()
        for (const e of (tuFeed as any).entity ?? []) {
          const tu = e.tripUpdate
          if (!tu?.stopTimeUpdate) continue
          for (const stu of tu.stopTimeUpdate) {
            if (siblingSet.has(stu.stopId)) {
              const arrTime = Number(stu.arrival?.time ?? stu.departure?.time ?? 0)
              if (arrTime > nowSec) tripPredictions.set(tu.trip?.tripId ?? '', arrTime)
              break
            }
          }
        }

        // Also add trip-updates that have predictions for this stop even if not in the static schedule
        for (const e of (tuFeed as any).entity ?? []) {
          const tu = e.tripUpdate
          if (!tu?.stopTimeUpdate) continue
          const tripId = tu.trip?.tripId ?? ''
          if (tripPredictions.has(tripId)) continue // already found
          for (const stu of tu.stopTimeUpdate) {
            if (siblingSet.has(stu.stopId)) {
              const arrTime = Number(stu.arrival?.time ?? stu.departure?.time ?? 0)
              if (arrTime > nowSec) {
                tripPredictions.set(tripId, arrTime)
                // Add to scheduled if not already there
                if (!scheduledArrivals.some((sa) => sa.trip_id === tripId)) {
                  scheduledArrivals.push({ trip_id: tripId, arrival_time: '', stop_id: stu.stopId })
                }
              }
              break
            }
          }
        }

        // Build results from scheduled arrivals
        const results = scheduledArrivals.map((sa) => {
          const trip = data.trips.get(sa.trip_id)
          const route = trip ? data.routes.get(trip.route_id) : undefined

          // Prefer realtime prediction, fall back to scheduled time
          const prediction = tripPredictions.get(sa.trip_id)
          let eta_minutes: number
          let expected_time: string | null = null
          if (prediction) {
            eta_minutes = Math.max(0, Math.round((prediction - nowSec) / 60))
            // Convert prediction unix timestamp to HH:MM, matching GTFS 24+ hour format
            const predDate = new Date(prediction * 1000)
            let predHour = predDate.getHours()
            const predMin = predDate.getMinutes()
            // If scheduled time uses 24+ hours (after midnight), match format
            if (sa.arrival_time) {
              const schedHour = parseInt(sa.arrival_time.split(':')[0], 10)
              if (schedHour >= 24 && predHour < 12) predHour += 24
            }
            expected_time = `${String(predHour).padStart(2, '0')}:${String(predMin).padStart(2, '0')}`
          } else {
            // Parse scheduled arrival time to minutes from now
            const [h, m] = sa.arrival_time.split(':').map(Number)
            const scheduledMinutes = h * 60 + m
            const nowMinutes = now.getHours() * 60 + now.getMinutes()
            eta_minutes = Math.max(0, scheduledMinutes - nowMinutes)
            expected_time = sa.arrival_time ? sa.arrival_time.slice(0, 5) : null
          }

          return {
            id: sa.trip_id,
            route_short_name: route?.route_short_name ?? null,
            route_type: route?.route_type ?? null,
            headsign: trip?.trip_headsign ?? null,
            route_id: trip?.route_id ?? null,
            scheduled_time: sa.arrival_time ? sa.arrival_time.slice(0, 5) : null,
            expected_time,
            eta_minutes,
            realtime: Boolean(prediction),
          }
        })

        // Deduplicate by trip_id, sort by ETA
        const seen = new Set<string>()
        return results
          .filter((r) => {
            if (seen.has(r.id)) return false
            seen.add(r.id)
            return true
          })
          .sort((a, b) => a.eta_minutes - b.eta_minutes)
          .slice(0, limit)
      } catch (e) {
        return jsonError(`Arrivals unavailable: ${e}`, 502)
      }
    },
    {
      query: t.Object({
        limit: t.Optional(t.String()),
      }),
      detail: { tags: ['Stops'], summary: 'Upcoming arrivals at a stop' },
    },
  )

  .get(
    '/routes',
    () => {
      const data = gtfs
      if (!data) return GTFS_NOT_READY()
      return [...data.routes.values()]
    },
    { detail: { tags: ['Routes'], summary: 'All routes' } },
  )

  .get(
    '/routes/:id',
    ({ params: { id } }) => {
      const data = gtfs
      if (!data) return GTFS_NOT_READY()
      try {
        const route = data.routes.get(id)
        if (!route) return jsonError('Route not found', 404)

        const routeTrips = [...data.trips.values()].filter((t) => t.route_id === id)
        const tripIds = new Set(routeTrips.map((t) => t.trip_id))
        const stopIds = new Set(
          data.stopTimes.filter((st) => tripIds.has(st.trip_id)).map((st) => st.stop_id),
        )
        const stops = [...stopIds].map((sid) => data.stops.get(sid)).filter(Boolean)

        return { ...route, trips: routeTrips.length, stops }
      } catch (e) {
        return jsonError(`Failed to retrieve route: ${e}`, 500)
      }
    },
    {
      detail: { tags: ['Routes'], summary: 'Route by ID with trips and stops' },
    },
  )

  .get(
    '/realtime/trip-updates',
    async () => {
      try {
        return await fetchTripUpdates()
      } catch (e) {
        return jsonError(`Trip updates unavailable: ${e}`, 502)
      }
    },
    { detail: { tags: ['Realtime'], summary: 'Trip updates' } },
  )

  .get(
    '/realtime/vehicles',
    async ({ query }) => {
      const data = gtfs
      if (!data) return GTFS_NOT_READY()
      try {
        const feed = await fetchVehiclePositions()
        let vehicles = enrichVehicles(feed.entity ?? [], data)

        if (query.route_id) vehicles = vehicles.filter((v) => v.route_id === query.route_id)

        if (query.route_type !== undefined)
          vehicles = vehicles.filter((v) => v.route_type === Number(query.route_type))

        if (query.low_floor === 'true') vehicles = vehicles.filter((v) => v.low_floor === true)

        return vehicles
      } catch (e) {
        return jsonError(`Vehicle positions unavailable: ${e}`, 502)
      }
    },
    {
      query: t.Object({
        route_id: t.Optional(t.String()),
        route_type: t.Optional(t.String()),
        low_floor: t.Optional(t.String()),
      }),
      detail: {
        tags: ['Realtime'],
        summary: 'Vehicle positions with enrichment and filters',
      },
    },
  )

await initGtfs()
setInterval(initGtfs, config.gtfs.refreshInterval)

app.listen(config.port)

console.log(`GTFS server running at http://localhost:${app.server?.port}`)
