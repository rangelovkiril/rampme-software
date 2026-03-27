import { Elysia, t } from 'elysia'
import { enrichVehicles } from '../gtfs/enrich'
import { fetchTripUpdates, fetchVehiclePositions } from '../gtfs/realtime'
import { getVehicleTripDetails } from '../services/trip-details'
import { getGtfs, jsonError } from '../state'

const GTFS_NOT_READY = () => jsonError('GTFS data not yet loaded', 503)

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
      const data = getGtfs()
      if (!data) return GTFS_NOT_READY()
      try {
        const feed = await fetchVehiclePositions()
        let vehicles = enrichVehicles(feed.entity ?? [], data)

        if (query.route_id) vehicles = vehicles.filter((v) => v.route_id === query.route_id)
        if (query.route_type !== undefined)
          vehicles = vehicles.filter((v) => v.route_type === Number(query.route_type))
        if (query.has_ramp === 'true') vehicles = vehicles.filter((v) => v.ramp_status !== 'unknown')

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
