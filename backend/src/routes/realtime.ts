import { Elysia, t } from 'elysia'
import { type EnrichedVehicle, enrichVehicles } from '../gtfs/enrich'
import {
  fetchTripUpdates,
  fetchVehiclePositions,
  getFeedHealth,
  gtfsRealtimeBroadcaster,
} from '../gtfs/realtime'
import { getReservationsByVehicle } from '../services/ramp/status'
import { makeSseStream } from '../services/sse'
import { getGtfs, jsonError } from '../services/state'
import { getTripEtas, getVehicleTripDetails } from '../services/transit/trip-details'

const GTFS_NOT_READY = () => jsonError('GTFS data not yet loaded', 503)

const EnrichedVehicleSchema = t.Object({
  id: t.String(),
  tripId: t.String(),
  lat: t.Number(),
  lng: t.Number(),
  bearing: t.Nullable(t.Number()),
  speed: t.Nullable(t.Number()),
  route_id: t.Nullable(t.String()),
  route_short_name: t.Nullable(t.String()),
  route_type: t.Nullable(t.Number()),
  headsign: t.Nullable(t.String()),
  label: t.Nullable(t.String()),
  ramp_status: t.Union([t.Literal('unknown'), t.Literal('working'), t.Literal('in_use')]),
  ramp_reservations: t.Array(
    t.Object({
      id: t.Number(),
      stop_id: t.String(),
      type: t.Union([t.Literal('board'), t.Literal('alight')]),
      status: t.Union([t.Literal('pending'), t.Literal('active')]),
    }),
  ),
})

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
    // Uses the `status()` context helper instead of the shared jsonError()
    // for its error paths — unlike every other route here, this one declares
    // a per-status `response` schema, and Elysia can only type-check a
    // status-tagged return against it, not a raw Response.
    async ({ query, status }) => {
      if (!getGtfs()) return status(503, { error: 'GTFS data not yet loaded' })
      try {
        const vehicles = await buildEnrichedVehicles(query)
        if (!vehicles) return status(503, { error: 'GTFS data not yet loaded' })
        return { vehicles, meta: { stale: getFeedHealth().vehiclePositions.stale } }
      } catch (e) {
        return status(502, { error: `Vehicle positions unavailable: ${e}` })
      }
    },
    {
      query: t.Object({
        route_id: t.Optional(t.String()),
        route_type: t.Optional(t.String()),
        has_ramp: t.Optional(t.String()),
      }),
      response: {
        200: t.Object({
          vehicles: t.Array(EnrichedVehicleSchema),
          meta: t.Object({ stale: t.Boolean() }),
        }),
        502: t.Object({ error: t.String() }),
        503: t.Object({ error: t.String() }),
      },
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
