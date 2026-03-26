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

function gtfsReady() {
  if (!gtfs) return jsonError('GTFS data not yet loaded', 503)
}

async function initGtfs() {
  try {
    gtfs = await fetchStaticGtfs()
  } catch (e) {
    console.error('Failed to load GTFS static data:', e)
    // Keep previous gtfs in place if a refresh fails; only log on first load
    if (!gtfs) console.error('Server starting without GTFS data — static endpoints will return 503')
  }
}

/** Enrich raw vehicle entities with GTFS static data and local DB extras */
function enrichVehicles(entities: any[]) {
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

  .get('/stops', () => [...gtfs.stops.values()], {
    detail: { tags: ['Stops'], summary: 'All stops' },
  })

  .get(
    '/stops/:id',
    ({ params: { id } }) => {
      const notReady = gtfsReady()
      if (notReady) return notReady
      try {
        const stop = gtfs!.stops.get(id)
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
    async ({ params: { id } }) => {
      const notReady = gtfsReady()
      if (notReady) return notReady
      try {
        if (!gtfs!.stops.has(id)) return jsonError('Stop not found', 404)

        const tripIds = new Set(
          gtfs!.stopTimes.filter((st) => st.stop_id === id).map((st) => st.trip_id),
        )

        const feed = await fetchVehiclePositions()
        return enrichVehicles(
          (feed.entity ?? []).filter((e: any) => tripIds.has(e.vehicle?.trip?.tripId)),
          gtfs!,
        )
      } catch (e) {
        return jsonError(`Vehicle positions unavailable: ${e}`, 502)
      }
    },
    { detail: { tags: ['Stops'], summary: 'Active vehicles serving a stop' } },
  )

  .get('/routes', () => [...gtfs.routes.values()], {
    detail: { tags: ['Routes'], summary: 'All routes' },
  })

  .get(
    '/routes/:id',
    ({ params: { id } }) => {
      const notReady = gtfsReady()
      if (notReady) return notReady
      try {
        const route = gtfs!.routes.get(id)
        if (!route) return jsonError('Route not found', 404)

        const routeTrips = [...gtfs!.trips.values()].filter((t) => t.route_id === id)
        const tripIds = new Set(routeTrips.map((t) => t.trip_id))
        const stopIds = new Set(
          gtfs!.stopTimes.filter((st) => tripIds.has(st.trip_id)).map((st) => st.stop_id),
        )
        const stops = [...stopIds].map((sid) => gtfs!.stops.get(sid)).filter(Boolean)

        return { ...route, trips: routeTrips.length, stops }
      } catch (e) {
        return jsonError(`Failed to retrieve route: ${e}`, 500)
      }
    },
    { detail: { tags: ['Routes'], summary: 'Route by ID with trips and stops' } },
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
      const notReady = gtfsReady()
      if (notReady) return notReady
      try {
        const feed = await fetchVehiclePositions()
        let vehicles = enrichVehicles(feed.entity ?? [], gtfs!)

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
