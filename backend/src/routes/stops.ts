import { Elysia, t } from 'elysia'
import { getFeedHealth, gtfsRealtimeBroadcaster } from '../gtfs/realtime'
import { activeServiceIds } from '../gtfs/services'
import { todayDateStr } from '../gtfs/time'
import type { GtfsData, Stop } from '../gtfs/types'
import { NotFoundError, upstream } from '../plugins/errors'
import { gtfsReady } from '../plugins/gtfs-ready'
import { models, toStopResponse } from '../schemas'
import { makeSseStream } from '../services/sse'
import { getGtfs } from '../services/state'
import { getUpcomingArrivals } from '../services/transit/arrivals'

const DEFAULT_ARRIVAL_LIMIT = 20
const MIN_ARRIVAL_LIMIT = 1
const MAX_ARRIVAL_LIMIT = 50

/** Clamps rather than rejects, so a stale client's out-of-range limit still renders. */
function clampLimit(raw: string | undefined): number {
  const n = Number(raw ?? DEFAULT_ARRIVAL_LIMIT)
  if (!Number.isFinite(n)) return DEFAULT_ARRIVAL_LIMIT
  return Math.min(Math.max(Math.trunc(n), MIN_ARRIVAL_LIMIT), MAX_ARRIVAL_LIMIT)
}

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
  .use(models)
  .use(gtfsReady)
  .get('/stops', ({ gtfs: data }) => getActiveStops(data).map(toStopResponse), {
    gtfsReady: true,
    response: { 200: 'Stops', 503: 'Error' },
    detail: { tags: ['Stops'], summary: 'All stops (active today)' },
  })

  .get(
    '/stops/:id',
    ({ params: { id }, gtfs: data }) => {
      const stop = data.stops.get(id)
      if (!stop) throw new NotFoundError('Stop not found')
      return toStopResponse(stop)
    },
    {
      gtfsReady: true,
      response: { 200: 'Stop', 404: 'Error', 503: 'Error' },
      detail: { tags: ['Stops'], summary: 'Stop by ID' },
    },
  )

  .get(
    '/stops/:id/vehicles',
    async ({ params: { id }, query, gtfs: data }) => {
      const stop = data.stops.get(id)
      if (!stop) throw new NotFoundError('Stop not found')

      return upstream('Arrivals', () => getUpcomingArrivals(data, id, clampLimit(query.limit)))
    },
    {
      gtfsReady: true,
      query: t.Object({ limit: t.Optional(t.String()) }),
      response: { 200: 'Arrivals', 404: 'Error', 502: 'Error', 503: 'Error' },
      detail: { tags: ['Stops'], summary: 'Upcoming arrivals at a stop' },
    },
  )

  .get(
    '/stops/:id/vehicles/stream',
    ({ params: { id }, query }) => {
      const limit = clampLimit(query.limit)
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
