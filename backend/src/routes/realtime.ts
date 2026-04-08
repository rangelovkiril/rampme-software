import { Elysia, t } from 'elysia'
import { enrichVehicles } from '../gtfs/enrich'
import { fetchTripUpdates, fetchVehiclePositions } from '../gtfs/realtime'
import { getMockTripDetails, MOCK_BUS_ID } from '../services/mock-bus'
import {
  getMockTripDetail,
  getMockVehicleSnapshot,
  isMockVehicleId,
} from '../services/mock-transit'
import { getVehicleRampInfo } from '../services/ramp'
import { getTripEtas, getVehicleTripDetails } from '../services/trip-details'
import { makeSseStream } from '../sse'
import { getGtfs, jsonError } from '../state'

const GTFS_NOT_READY = () => jsonError('GTFS data not yet loaded', 503)

async function buildEnrichedVehicles(filters: {
  route_id?: string
  route_type?: string
  has_ramp?: string
}) {
  const data = getGtfs()
  if (!data) return null
  const feed = await fetchVehiclePositions()
  let vehicles = enrichVehicles(feed.entity ?? [], data)
  const mockVehicle = getMockVehicleSnapshot()
  const mockRamp = getVehicleRampInfo(mockVehicle.id, true)
  vehicles.push({
    ...mockVehicle,
    ramp_status: mockRamp.ramp_status,
    ramp_reservations: mockRamp.reservations,
  })
  if (filters.route_id) vehicles = vehicles.filter((v) => v.route_id === filters.route_id)
  if (filters.route_type !== undefined)
    vehicles = vehicles.filter((v) => v.route_type === Number(filters.route_type))
  if (filters.has_ramp === 'true') vehicles = vehicles.filter((v) => v.ramp_status !== 'unknown')
  return vehicles
}

function mockTripEtas(trip: {
  stops: {
    stop_id: string
    eta_minutes: number | null
    status: string
    expected_time: string | null
    delay_minutes: number
    realtime: boolean
  }[]
}) {
  return trip.stops.map((s) => ({
    stop_id: s.stop_id,
    eta_minutes: s.eta_minutes,
    status: s.status,
    expected_time: s.expected_time,
    delay_minutes: s.delay_minutes,
    realtime: s.realtime,
  }))
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
      if (id === MOCK_BUS_ID) return getMockTripDetails()
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
        if (id === MOCK_BUS_ID) return mockTripEtas(getMockTripDetails())
        if (isMockVehicleId(id)) return mockTripEtas(getMockTripDetail())
        const data = getGtfs()
        if (!data) return null
        return getTripEtas(data, id)
      }),
    { detail: { tags: ['Realtime'], summary: 'SSE stream of ETA updates for a vehicle trip' } },
  )
