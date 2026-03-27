import { Elysia, t } from 'elysia'
import type { Route } from '../gtfs/types'
import { getGtfs, jsonError } from '../state'

const GTFS_NOT_READY = () => jsonError('GTFS data not yet loaded', 503)

export const routesRoutes = new Elysia()
  .get(
    '/routes',
    () => {
      const data = getGtfs()
      if (!data) return GTFS_NOT_READY()

      // Deduplicate routes with the same short name and type (e.g. "11Tm" / "11TM")
      const seen = new Map<string, Route>()
      for (const r of data.routes.values()) {
        const key = `${r.route_short_name.toLowerCase()}::${r.route_type}`
        if (!seen.has(key)) seen.set(key, r)
      }
      return [...seen.values()]
    },
    { detail: { tags: ['Routes'], summary: 'All routes (deduplicated)' } },
  )

  .get(
    '/routes/:id',
    ({ params: { id } }) => {
      const data = getGtfs()
      if (!data) return GTFS_NOT_READY()
      try {
        const route = data.routes.get(id)
        if (!route) return jsonError('Route not found', 404)

        const routeTrips = [...data.trips.values()].filter((t) => t.route_id === id)
        const tripIds = new Set(routeTrips.map((t) => t.trip_id))
        const stopIds = new Set(
          data.stopTimes.filter((st) => tripIds.has(st.trip_id)).map((st) => st.stop_id),
        )
        const stops = [...stopIds].map((sid) => data.stops.get(sid)).filter(Boolean)

        return { ...route, trips: routeTrips.length, stops }
      } catch (e) {
        return jsonError(`Failed to retrieve route: ${e}`, 500)
      }
    },
    { detail: { tags: ['Routes'], summary: 'Route by ID with trips and stops' } },
  )

  .get(
    '/routes/shapes',
    ({ query }) => {
      const data = getGtfs()
      if (!data) return GTFS_NOT_READY()
      try {
        const ids = (query.ids ?? '').split(',').filter(Boolean)
        if (ids.length === 0) return jsonError('Missing ids query parameter', 400)
        if (ids.length > 50) return jsonError('Too many route IDs (max 50)', 400)

        const result: Record<string, { route_type: number; polylines: [number, number][][] }> = {}
        for (const id of ids) {
          const route = data.routes.get(id)
          const polylines = data.shapesByRoute.get(id)
          if (route && polylines) {
            result[id] = { route_type: route.route_type, polylines }
          }
        }
        return result
      } catch (e) {
        return jsonError(`Failed to retrieve shapes: ${e}`, 500)
      }
    },
    {
      query: t.Object({ ids: t.Optional(t.String()) }),
      detail: { tags: ['Routes'], summary: 'Batch route shapes by IDs' },
    },
  )
