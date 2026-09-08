import { Elysia } from 'elysia'
import { getGtfs } from '../services/state'

/**
 * Opt-in guard for routes that cannot answer before the initial GTFS parse
 * finishes. Marking a route `gtfsReady: true` resolves the loaded `GtfsData`
 * into its context, or short-circuits with 503 when it is not there yet.
 *
 * SSE handlers deliberately do not use it: they return `null` for a tick with
 * no data rather than failing the stream.
 */
export const gtfsReady = new Elysia({ name: 'gtfs-ready' }).macro({
  gtfsReady: {
    resolve({ status }) {
      const gtfs = getGtfs()
      if (!gtfs) return status(503, { error: 'GTFS data not yet loaded' })
      return { gtfs }
    },
  },
})
