import { Elysia, t } from 'elysia'
import { activeServiceIds } from '../gtfs/services'
import { getUpcomingArrivals } from '../services/arrivals'
import { getMockArrivalForStop, getMockStopById, getMockStops } from '../services/mock-transit'
import { getGtfs, jsonError } from '../state'

const GTFS_NOT_READY = () => jsonError('GTFS data not yet loaded', 503)

export const stopsRoutes = new Elysia()
  .get(
    '/stops',
    () => {
      const data = getGtfs()
      if (!data) return getMockStops()

      const services = activeServiceIds(data.calendarDates)

      const activeStopIds = new Set<string>()
      for (const [stopId, times] of data.stopTimesByStop) {
        for (const st of times) {
          const trip = data.trips.get(st.trip_id)
          if (trip && services.has(trip.service_id)) {
            activeStopIds.add(stopId)
            break
          }
        }
      }

      const activeStops = [...data.stops.values()].filter((s) => activeStopIds.has(s.stop_id))
      const mockStops = getMockStops()

      const seen = new Set(activeStops.map((s) => s.stop_id))
      for (const ms of mockStops) {
        if (!seen.has(ms.stop_id)) activeStops.push(ms)
      }

      return activeStops
    },
    { detail: { tags: ['Stops'], summary: 'All stops (active today)' } },
  )

  .get(
    '/stops/:id',
    ({ params: { id } }) => {
      const data = getGtfs()
      if (!data) {
        const mockStop = getMockStopById(id)
        if (mockStop) return mockStop
        return GTFS_NOT_READY()
      }

      const stop = data.stops.get(id) ?? getMockStopById(id)
      if (!stop) return jsonError('Stop not found', 404)
      return stop
    },
    { detail: { tags: ['Stops'], summary: 'Stop by ID' } },
  )

  .get(
    '/stops/:id/vehicles',
    async ({ params: { id }, query }) => {
      const data = getGtfs()
      if (!data) {
        const mockArrival = getMockArrivalForStop(id)
        if (mockArrival) return [mockArrival]
        return GTFS_NOT_READY()
      }

      const stop = data.stops.get(id) ?? getMockStopById(id)
      if (!stop) return jsonError('Stop not found', 404)

      const rawLimit = Number(query.limit ?? '20')
      const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(Math.trunc(rawLimit), 1), 50) : 20

      try {
        return await getUpcomingArrivals(data, id, limit)
      } catch (e) {
        return jsonError(`Arrivals unavailable: ${e}`, 502)
      }
    },
    {
      query: t.Object({ limit: t.Optional(t.String()) }),
      detail: { tags: ['Stops'], summary: 'Upcoming arrivals at a stop' },
    },
  )
