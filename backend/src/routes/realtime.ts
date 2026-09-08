import { Elysia, t } from 'elysia'
import { getAccessibility } from '../gtfs/accessibility'
import { enrichVehicles } from '../gtfs/enrich'
import {
  fetchTripUpdates,
  fetchVehiclePositions,
  getFeedHealth,
  gtfsRealtimeBroadcaster,
} from '../gtfs/realtime'
import { NotFoundError, upstream } from '../plugins/errors'
import { gtfsReady } from '../plugins/gtfs-ready'
import type { EnrichedVehicle } from '../schemas'
import { models, type VehicleFilterQuery } from '../schemas'
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

async function buildEnrichedVehicles(filters: VehicleFilterQuery) {
  const vehicles = await getUnfilteredVehicles()
  if (!vehicles) return null
  let filtered = vehicles
  if (filters.routeId) filtered = filtered.filter((v) => v.routeId === filters.routeId)
  if (filters.routeType !== undefined)
    filtered = filtered.filter((v) => v.routeType === Number(filters.routeType))
  if (filters.hasRamp === 'true')
    filtered = filtered.filter((v) => v.rampStatus === 'working' || v.rampStatus === 'in_use')
  return filtered
}

export const realtimeRoutes = new Elysia()
  .use(models)
  .use(gtfsReady)
  .get('/realtime/trip-updates', () => upstream('Trip updates', fetchTripUpdates), {
    response: { 200: 'TripUpdates', 502: 'Error' },
    detail: { tags: ['Realtime'], summary: 'Trip updates' },
  })

  .get(
    '/realtime/vehicles',
    async ({ query, status }) => {
      const vehicles = await upstream('Vehicle positions', () => buildEnrichedVehicles(query))
      if (!vehicles) return status(503, { error: 'GTFS data not yet loaded' })
      return { vehicles, meta: { stale: getFeedHealth().vehiclePositions.stale } }
    },
    {
      gtfsReady: true,
      query: 'VehicleFilterQuery',
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
      query: 'VehicleFilterQuery',
      detail: { tags: ['Realtime'], summary: 'SSE stream of vehicle positions' },
    },
  )

  .get(
    '/realtime/vehicles/:id/trip',
    async ({ params: { id }, gtfs: data }) => {
      const result = await upstream('Trip info', () => getVehicleTripDetails(data, id))
      if (!result) throw new NotFoundError('Vehicle or trip not found')
      return result
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
