import cors from '@elysiajs/cors'
import { Elysia, t } from 'elysia'
import { config } from './config'
import { getVehicleExtra } from './db/vehicles'
import { fetchTripUpdates, fetchVehiclePositions } from './gtfs/realtime'
import { fetchStaticGtfs } from './gtfs/static'
import type { GtfsData } from './gtfs/types'
import { swaggerPlugin } from './swagger'

let gtfs: GtfsData

async function initGtfs() {
  gtfs = await fetchStaticGtfs()
}

/** Enrich raw vehicle entities with GTFS static data and local DB extras */
function enrichVehicles(entities: any[]) {
  return entities
    .filter((e) => e.vehicle?.position)
    .map((e) => {
      const v = e.vehicle
      const pos = v.position
      const trip = gtfs.trips.get(v.trip?.tripId ?? '')
      const route = trip ? gtfs.routes.get(trip.route_id) : undefined
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
      const stop = gtfs.stops.get(id)
      if (!stop) return new Response('Not found', { status: 404 })
      return stop
    },
    { detail: { tags: ['Stops'], summary: 'Stop by ID' } },
  )

  .get(
    '/stops/:id/vehicles',
    async ({ params: { id } }) => {
      if (!gtfs.stops.has(id)) return new Response('Stop not found', { status: 404 })

      const tripIds = new Set(
        gtfs.stopTimes.filter((st) => st.stop_id === id).map((st) => st.trip_id),
      )

      const feed = await fetchVehiclePositions()
      return enrichVehicles(
        (feed.entity ?? []).filter((e: any) => tripIds.has(e.vehicle?.trip?.tripId)),
      )
    },
    { detail: { tags: ['Stops'], summary: 'Active vehicles serving a stop' } },
  )

  .get('/routes', () => [...gtfs.routes.values()], {
    detail: { tags: ['Routes'], summary: 'All routes' },
  })

  .get(
    '/routes/:id',
    ({ params: { id } }) => {
      const route = gtfs.routes.get(id)
      if (!route) return new Response('Not found', { status: 404 })

      const routeTrips = [...gtfs.trips.values()].filter((t) => t.route_id === id)
      const tripIds = new Set(routeTrips.map((t) => t.trip_id))
      const stopIds = new Set(
        gtfs.stopTimes.filter((st) => tripIds.has(st.trip_id)).map((st) => st.stop_id),
      )
      const stops = [...stopIds].map((sid) => gtfs.stops.get(sid)).filter(Boolean)

      return { ...route, trips: routeTrips.length, stops }
    },
    { detail: { tags: ['Routes'], summary: 'Route by ID with trips and stops' } },
  )

  .get(
    '/realtime/trip-updates',
    async () => {
      try {
        return await fetchTripUpdates()
      } catch (e) {
        return new Response(`Trip updates unavailable: ${e}`, { status: 502 })
      }
    },
    { detail: { tags: ['Realtime'], summary: 'Trip updates' } },
  )

  .get(
    '/realtime/vehicles',
    async ({ query }) => {
      try {
        const feed = await fetchVehiclePositions()
        let vehicles = enrichVehicles(feed.entity ?? [])

        if (query.route_id) vehicles = vehicles.filter((v) => v.route_id === query.route_id)

        if (query.route_type !== undefined)
          vehicles = vehicles.filter((v) => v.route_type === Number(query.route_type))

        if (query.low_floor === 'true') vehicles = vehicles.filter((v) => v.low_floor === true)

        return vehicles
      } catch (e) {
        return new Response(`Vehicle positions unavailable: ${e}`, {
          status: 502,
        })
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