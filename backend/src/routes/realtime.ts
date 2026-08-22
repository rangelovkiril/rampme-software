import { Elysia, t } from 'elysia'
import { type EnrichedVehicle, enrichVehicles } from '../gtfs/enrich'
import { fetchTripUpdates, fetchVehiclePositions, realtimeEvents } from '../gtfs/realtime'
import { getReservationsByVehicle } from '../services/ramp/status'
import { makeSseStream } from '../services/sse'
import { getGtfs, jsonError } from '../services/state'
import { getTripEtas, getVehicleTripDetails } from '../services/transit/trip-details'

const GTFS_NOT_READY = () => jsonError('GTFS data not yet loaded', 503)

// Bumped on every realtime refresh so the unfiltered enrichment below is
// computed at most once per tick, regardless of how many clients ask for it.
let currentTick = 0
realtimeEvents.on('refresh', () => {
  currentTick++
})

let cache: { tick: number; vehicles: EnrichedVehicle[] } | null = null

async function getUnfilteredVehicles(): Promise<EnrichedVehicle[] | null> {
  const data = getGtfs()
  if (!data) return null
  if (cache && cache.tick === currentTick) return cache.vehicles
  const feed = await fetchVehiclePositions()
  const reservationsByVehicle = getReservationsByVehicle()
  const vehicles = enrichVehicles(feed.entity ?? [], data, reservationsByVehicle)
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
  if (filters.has_ramp === 'true') filtered = filtered.filter((v) => v.ramp_status !== 'unknown')
  return filtered
}

export const realtimeRoutes = new Elysia()
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
      if (!getGtfs()) return GTFS_NOT_READY()
      try {
        const vehicles = await buildEnrichedVehicles(query)
        if (!vehicles) return GTFS_NOT_READY()
        return vehicles
      } catch (e) {
        return jsonError(`Vehicle positions unavailable: ${e}`, 502)
      }
    },
    {
      query: t.Object({
        route_id: t.Optional(t.String()),
        route_type: t.Optional(t.String()),
        has_ramp: t.Optional(t.String()),
      }),
      detail: { tags: ['Realtime'], summary: 'Vehicle positions with enrichment and filters' },
    },
  )

  .get(
    '/realtime/vehicles/stream',
    ({ request, query }) =>
      makeSseStream(request, () => buildEnrichedVehicles(query).then((v) => v ?? null)),
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
    async ({ params: { id } }) => {
      const data = getGtfs()
      if (!data) return GTFS_NOT_READY()
      try {
        const result = await getVehicleTripDetails(data, id)
        if (!result) return jsonError('Vehicle or trip not found', 404)
        return result
      } catch (e) {
        return jsonError(`Trip info unavailable: ${e}`, 502)
      }
    },
    { detail: { tags: ['Realtime'], summary: 'Trip stops for a vehicle' } },
  )

  .get(
    '/realtime/vehicles/:id/trip/etas',
    ({ request, params: { id } }) =>
      makeSseStream(request, async () => {
        const data = getGtfs()
        if (!data) return null
        return getTripEtas(data, id)
      }),
    { detail: { tags: ['Realtime'], summary: 'SSE stream of ETA updates for a vehicle trip' } },
  )
