import { Elysia, t } from 'elysia'
import { getAccessibility } from '../gtfs/accessibility'
import { enrichVehicles } from '../gtfs/enrich'
import {
  fetchTripUpdates,
  fetchVehiclePositions,
  getFeedHealth,
  gtfsRealtimeBroadcaster,
} from '../gtfs/realtime'
import { gtfsReady } from '../plugins/gtfs-ready'
import type { EnrichedVehicle } from '../schemas'
import { models } from '../schemas'
import { getReservationsByVehicle } from '../services/ramp/status'
import { makeSseStream } from '../services/sse'
import { getGtfs } from '../services/state'
import { getTripEtas, getVehicleTripDetails } from '../services/transit/trip-details'

// Bumped on every realtime tick so the unfiltered enrichment below is
// computed at most once per tick, regardless of how many clients ask for it.
let currentTick = 0
;(async () => {
  for await (const update of gtfsRealtimeBroadcaster.subscribe()) {
    currentTick = update.tick
  }
})()

let cache: { tick: number; vehicles: EnrichedVehicle[] } | null = null

async function getUnfilteredVehicles(): Promise<EnrichedVehicle[] | null> {
  const data = getGtfs()
  if (!data) return null
  if (cache && cache.tick === currentTick) return cache.vehicles
  const feed = await fetchVehiclePositions()
  const reservationsByVehicle = getReservationsByVehicle()
  const vehicles = enrichVehicles(
    feed.entity ?? [],
    data,
    reservationsByVehicle,
    getAccessibility().resolve,
  )
  cache = { tick: currentTick, vehicles }
  return vehicles
}

async function buildEnrichedVehicles(filters: {
  route_id?: string
  route_type?: string
  has_ramp?: string
}) {
  const vehicles = await getUnfilteredVehicles()
  if (!vehicles) return null
  let filtered = vehicles
  if (filters.route_id) filtered = filtered.filter((v) => v.route_id === filters.route_id)
  if (filters.route_type !== undefined)
    filtered = filtered.filter((v) => v.route_type === Number(filters.route_type))
  if (filters.has_ramp === 'true')
    filtered = filtered.filter((v) => v.ramp_status === 'working' || v.ramp_status === 'in_use')
  return filtered
}

export const realtimeRoutes = new Elysia()
  .use(models)
  .use(gtfsReady)
  .get(
    '/realtime/trip-updates',
    async ({ status }) => {
      try {
        return await fetchTripUpdates()
      } catch (e) {
        return status(502, { error: `Trip updates unavailable: ${e}` })
      }
    },
    {
      response: { 200: 'TripUpdates', 502: 'Error' },
      detail: { tags: ['Realtime'], summary: 'Trip updates' },
    },
  )

  .get(
    '/realtime/vehicles',
    async ({ query, status }) => {
      try {
        const vehicles = await buildEnrichedVehicles(query)
        if (!vehicles) return status(503, { error: 'GTFS data not yet loaded' })
        return { vehicles, meta: { stale: getFeedHealth().vehiclePositions.stale } }
      } catch (e) {
        return status(502, { error: `Vehicle positions unavailable: ${e}` })
      }
    },
    {
      gtfsReady: true,
      query: t.Object({
        route_id: t.Optional(t.String()),
        route_type: t.Optional(t.String()),
        has_ramp: t.Optional(t.String()),
      }),
      response: { 200: 'Vehicles', 502: 'Error', 503: 'Error' },
      detail: { tags: ['Realtime'], summary: 'Vehicle positions with enrichment and filters' },
    },
  )

  .get(
    '/realtime/vehicles/stream',
    ({ query }) =>
      makeSseStream(gtfsRealtimeBroadcaster, async () => {
        const vehicles = await buildEnrichedVehicles(query)
        if (!vehicles) return null
        return { data: vehicles, healthy: !getFeedHealth().vehiclePositions.stale }
      }),
    {
      query: t.Object({
        route_id: t.Optional(t.String()),
        route_type: t.Optional(t.String()),
        has_ramp: t.Optional(t.String()),
      }),
      detail: { tags: ['Realtime'], summary: 'SSE stream of vehicle positions' },
    },
  )

  .get(
    '/realtime/vehicles/:id/trip',
    async ({ params: { id }, gtfs: data, status }) => {
      try {
        const result = await getVehicleTripDetails(data, id)
        if (!result) return status(404, { error: 'Vehicle or trip not found' })
        return result
      } catch (e) {
        return status(502, { error: `Trip info unavailable: ${e}` })
      }
    },
    {
      gtfsReady: true,
      response: { 200: 'TripDetail', 404: 'Error', 502: 'Error', 503: 'Error' },
      detail: { tags: ['Realtime'], summary: 'Trip stops for a vehicle' },
    },
  )

  .get(
    '/realtime/vehicles/:id/trip/etas',
    ({ params: { id } }) =>
      makeSseStream(gtfsRealtimeBroadcaster, async () => {
        const data = getGtfs()
        if (!data) return null
        const etas = await getTripEtas(data, id)
        if (!etas) return null
        const health = getFeedHealth()
        return { data: etas, healthy: !health.tripUpdates.stale && !health.vehiclePositions.stale }
      }),
    { detail: { tags: ['Realtime'], summary: 'SSE stream of ETA updates for a vehicle trip' } },
  )
