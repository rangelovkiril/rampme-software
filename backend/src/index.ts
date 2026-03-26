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
      const trip = data.trips.get(v.trip?.tripId ?? '')
      const route = trip ? data.routes.get(trip.route_id) : undefined
      const extra = getVehicleExtra(v.vehicle?.id ?? '')

      return {
        id: v.vehicle?.id ?? e.id,
        lat: pos.latitude,
        lng: pos.longitude,
        bearing: pos.bearing ?? null,
        speed: pos.speed ?? null,
        route_id: trip?.route_id ?? null,
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

        const tripIds = new Set(
          data.stopTimes.filter((st) => st.stop_id === id).map((st) => st.trip_id),
        )

        const feed = await fetchVehiclePositions()
        return enrichVehicles(
          (feed.entity ?? []).filter((e: any) => tripIds.has(e.vehicle?.trip?.tripId)),
          data,
        )
          .filter((v) => Number.isFinite(v.lat) && Number.isFinite(v.lng))
          .map((v) => {
            const distance_m = Math.round(
              haversineMeters(v.lat, v.lng, stop.stop_lat, stop.stop_lon),
            )
            const eta_minutes = Math.max(
              0,
              Math.round(distance_m / estimateSpeedMps(v.speed, v.route_type) / 60),
            )

            return {
              ...v,
              distance_m,
              eta_minutes,
            }
          })
          .sort((a, b) => a.eta_minutes - b.eta_minutes || a.distance_m - b.distance_m)
          .slice(0, limit)
      } catch (e) {
        return jsonError(`Vehicle positions unavailable: ${e}`, 502)
      }
    },
    {
      query: t.Object({
        limit: t.Optional(t.String()),
      }),
      detail: { tags: ['Stops'], summary: 'Active vehicles serving a stop' },
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

app.get('/health', () => 'Ok')

app.listen(config.port)

console.log(`GTFS server running at http://localhost:${app.server?.port}`)
