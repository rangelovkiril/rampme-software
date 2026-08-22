import { Elysia, t } from 'elysia'
import { getFeedHealth, gtfsRealtimeBroadcaster } from '../gtfs/realtime'
import { activeServiceIds } from '../gtfs/services'
import { todayDateStr } from '../gtfs/time'
import type { GtfsData, Stop } from '../gtfs/types'
import { makeSseStream } from '../services/sse'
import { getGtfs, jsonError } from '../services/state'
import { getUpcomingArrivals } from '../services/transit/arrivals'

const GTFS_NOT_READY = () => jsonError('GTFS data not yet loaded', 503)

let stopsCache: { dateStr: string; data: GtfsData; result: Stop[] } | null = null

function getActiveStops(data: GtfsData): Stop[] {
  const dateStr = todayDateStr()
  if (stopsCache && stopsCache.dateStr === dateStr && stopsCache.data === data) {
    return stopsCache.result
  }

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

  const result = [...data.stops.values()].filter((s) => activeStopIds.has(s.stop_id))
  stopsCache = { dateStr, data, result }
  return result
}

export const stopsRoutes = new Elysia()
  .get(
    '/stops',
    () => {
      const data = getGtfs()
      if (!data) return GTFS_NOT_READY()
      return getActiveStops(data)
    },
    { detail: { tags: ['Stops'], summary: 'All stops (active today)' } },
  )

  .get(
    '/stops/:id',
    ({ params: { id } }) => {
      const data = getGtfs()
      if (!data) return GTFS_NOT_READY()

      const stop = data.stops.get(id)
      if (!stop) return jsonError('Stop not found', 404)
      return stop
    },
    { detail: { tags: ['Stops'], summary: 'Stop by ID' } },
  )

  .get(
    '/stops/:id/vehicles',
    async ({ params: { id }, query }) => {
      const data = getGtfs()
      if (!data) return GTFS_NOT_READY()

      const stop = data.stops.get(id)
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

  .get(
    '/stops/:id/vehicles/stream',
    ({ params: { id }, query }) => {
      const rawLimit = Number(query.limit ?? '20')
      const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(Math.trunc(rawLimit), 1), 50) : 20
      return makeSseStream(gtfsRealtimeBroadcaster, async () => {
        const data = getGtfs()
        if (!data) return null
        const stop = data.stops.get(id)
        if (!stop) return null
        const arrivals = await getUpcomingArrivals(data, id, limit)
        const health = getFeedHealth()
        return {
          data: arrivals,
          healthy: !health.tripUpdates.stale && !health.vehiclePositions.stale,
        }
      })
    },
    {
      query: t.Object({ limit: t.Optional(t.String()) }),
      detail: { tags: ['Stops'], summary: 'SSE stream of upcoming arrivals at a stop' },
    },
  )
