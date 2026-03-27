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

const FALLBACK_SPEED_MPS: Partial<Record<number, number>> = {
  0: 7, // tram
  1: 12, // metro
  3: 8, // bus
  11: 8, // trolleybus
}

function estimateSpeedMps(speed: number | null, routeType: number | null) {
  if (typeof speed === 'number' && Number.isFinite(speed) && speed > 0.5) {
    return speed
  }

  if (typeof routeType === 'number') {
    return FALLBACK_SPEED_MPS[routeType] ?? 8
  }

  return 8
}

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  const toRad = (value: number) => (value * Math.PI) / 180
  const earthRadius = 6_371_000
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2

  return 2 * earthRadius * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/** Toggle ramp availability mode:
 *  true  = every bus is treated as ramp-equipped (for testing)
 *  false = only buses with wheelchair_accessible=1 in GTFS data */
const RAMP_ALL = false

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
      const tripId = v.trip?.trip_id ?? ''
      const rawRouteId = v.trip?.route_id ?? ''
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
          const tu = e.trip_update
          if (!tu?.stop_time_update) continue
          for (const stu of tu.stop_time_update) {
            if (siblingSet.has(stu.stop_id)) {
              const arrTime = Number(stu.arrival?.time ?? stu.departure?.time ?? 0)
              if (arrTime > nowSec) tripPredictions.set(tu.trip?.trip_id ?? '', arrTime)
              break
            }
          }
        }

        for (const e of (tuFeed as any).entity ?? []) {
          const tu = e.trip_update
          if (!tu?.stop_time_update) continue
          const tripId = tu.trip?.trip_id ?? ''
          if (tripPredictions.has(tripId)) continue
          for (const stu of tu.stop_time_update) {
            if (siblingSet.has(stu.stop_id)) {
              const arrTime = Number(stu.arrival?.time ?? stu.departure?.time ?? 0)
              if (arrTime > nowSec) {
                tripPredictions.set(tripId, arrTime)
                if (!scheduledArrivals.some((sa) => sa.trip_id === tripId)) {
                  scheduledArrivals.push({ trip_id: tripId, arrival_time: '', stop_id: stu.stop_id })
                }
              }
              break
            }
          }
        }

        const results = scheduledArrivals.map((sa) => {
          const trip = data.trips.get(sa.trip_id)
          const route = trip ? data.routes.get(trip.route_id) : undefined

          const prediction = tripPredictions.get(sa.trip_id)
          let eta_minutes: number
          let expected_time: string | null = null
          if (prediction) {
            eta_minutes = Math.max(0, Math.round((prediction - nowSec) / 60))
            const predDate = new Date(prediction * 1000)
            let predHour = predDate.getHours()
            const predMin = predDate.getMinutes()
            if (sa.arrival_time) {
              const schedHour = parseInt(sa.arrival_time.split(':')[0], 10)
              if (schedHour >= 24 && predHour < 12) predHour += 24
            }
            expected_time = `${String(predHour).padStart(2, '0')}:${String(predMin).padStart(2, '0')}`
          } else {
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
            has_ramp: RAMP_ALL ? true : trip?.wheelchair_accessible === 1,
          }
        })

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
    '/routes/shapes',
    ({ query }) => {
      const data = gtfs
      if (!data) return GTFS_NOT_READY()
      try {
        const ids = (query.ids ?? '').split(',').filter(Boolean)
        if (ids.length === 0) return jsonError('Missing ids query parameter', 400)
        if (ids.length > 50) return jsonError('Too many route IDs (max 50)', 400)

        const result: Record<string, { route_type: number; polylines: [number, number][][] }> = {}
        for (const id of ids) {
          const route = data.routes.get(id)
          const polylines = data.shapesByRoute.get(id)
          if (route && polylines) {
            result[id] = { route_type: route.route_type, polylines }
          }
        }
        return result
      } catch (e) {
        return jsonError(`Failed to retrieve shapes: ${e}`, 500)
      }
    },
    {
      query: t.Object({
        ids: t.Optional(t.String()),
      }),
      detail: { tags: ['Routes'], summary: 'Batch route shapes by IDs' },
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

app.get('/health', () => 'Ok')

app.listen(config.port)

console.log(`GTFS server running at http://localhost:${app.server?.port}`)