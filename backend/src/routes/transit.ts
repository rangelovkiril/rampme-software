import { Elysia, t } from 'elysia'
import type { Route } from '../gtfs/types'
import { gtfsReady } from '../plugins/gtfs-ready'
import { models, type RouteShapesResponse } from '../schemas'

/** Bound so one request cannot ask for every shape in the feed at once. */
const MAX_SHAPE_IDS = 50

export const transitRoutes = new Elysia()
  .use(models)
  .use(gtfsReady)
  .get(
    '/routes',
    ({ gtfs: data }) => {
      // Deduplicate routes with the same short name and type (e.g. "11Tm" / "11TM")
      const seen = new Map<string, Route>()
      for (const r of data.routes.values()) {
        const key = `${r.route_short_name.toLowerCase()}::${r.route_type}`
        if (!seen.has(key)) seen.set(key, r)
      }
      return [...seen.values()]
    },
    {
      gtfsReady: true,
      response: { 200: 'Routes', 503: 'Error' },
      detail: { tags: ['Routes'], summary: 'All routes (deduplicated)' },
    },
  )

  .get(
    '/routes/:id',
    ({ params: { id }, gtfs: data, status }) => {
      const route = data.routes.get(id)
      if (!route) return status(404, { error: 'Route not found' })

      const routeTrips = data.tripsByRoute.get(id) ?? []
      const stopIds = data.stopIdsByRoute.get(id) ?? new Set<string>()
      const stops = [...stopIds].map((sid) => data.stops.get(sid)).filter((s) => s !== undefined)

      return { ...route, trips: routeTrips.length, stops }
    },
    {
      gtfsReady: true,
      response: { 200: 'RouteDetail', 404: 'Error', 503: 'Error' },
      detail: { tags: ['Routes'], summary: 'Route by ID with trips and stops' },
    },
  )

  .get(
    '/routes/shapes',
    ({ query, gtfs: data, status }) => {
      const ids = (query.ids ?? '').split(',').filter(Boolean)
      if (ids.length === 0) return status(400, { error: 'Missing ids query parameter' })
      if (ids.length > MAX_SHAPE_IDS)
        return status(400, { error: `Too many route IDs (max ${MAX_SHAPE_IDS})` })

      const result: RouteShapesResponse = {}
      for (const id of ids) {
        const route = data.routes.get(id)
        const polylines = data.shapesByRoute.get(id)
        if (route && polylines) {
          result[id] = { route_type: route.route_type, polylines }
        }
      }
      return result
    },
    {
      gtfsReady: true,
      query: t.Object({ ids: t.Optional(t.String()) }),
      response: { 200: 'RouteShapes', 400: 'Error', 503: 'Error' },
      detail: { tags: ['Routes'], summary: 'Batch route shapes by IDs' },
    },
  )
