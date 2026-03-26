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

/** Взима суровите entities и ги обогатява с GTFS статика + локална БД */
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

  // ── Stops ───────────────────────────────────────
  .get('/stops', () => [...gtfs.stops.values()], {
    detail: { tags: ['Stops'], summary: 'Всички спирки' },
  })

  .get(
    '/stops/:id',
    ({ params: { id } }) => {
      const stop = gtfs.stops.get(id)
      if (!stop) return new Response('Not found', { status: 404 })
      return stop
    },
    { detail: { tags: ['Stops'], summary: 'Спирка по ID' } },
  )

  .get(
    '/stops/:id/vehicles',
    async ({ params: { id }, query }) => {
      const stop = gtfs.stops.get(id)
      if (!stop) return new Response('Stop not found', { status: 404 })

      const rawLimit = Number(query.limit ?? '20')
      const limit = Number.isFinite(rawLimit)
        ? Math.min(Math.max(Math.trunc(rawLimit), 1), 50)
        : 20

      const tripIds = new Set(
        gtfs.stopTimes.filter((st) => st.stop_id === id).map((st) => st.trip_id),
      )

      const feed = await fetchVehiclePositions()
      return enrichVehicles(
        (feed.entity ?? []).filter((e: any) => tripIds.has(e.vehicle?.trip?.tripId)),
      )
        .filter((v) => Number.isFinite(v.lat) && Number.isFinite(v.lng))
        .map((v) => {
          const distance_m = Math.round(haversineMeters(v.lat, v.lng, stop.stop_lat, stop.stop_lon))
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
    },
    {
      query: t.Object({
        limit: t.Optional(t.String()),
      }),
      detail: { tags: ['Stops'], summary: 'Най-близки активни возила по спирка' },
    },
  )

  // ── Routes ──────────────────────────────────────
  .get('/routes', () => [...gtfs.routes.values()], {
    detail: { tags: ['Routes'], summary: 'Всички маршрути' },
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
    { detail: { tags: ['Routes'], summary: 'Маршрут по ID с trips и спирки' } },
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
        summary: 'Vehicle positions — обогатени и филтрирани',
      },
    },
  )

  .listen(config.port)

await initGtfs()
setInterval(initGtfs, config.gtfs.refreshInterval)

console.log(`🚌 GTFS server running at http://localhost:${app.server?.port}`)
