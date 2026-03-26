import protobuf from 'protobufjs'
import { config } from '../config'
import { createCache } from './cache'

let FeedMessage: protobuf.Type

/**
 * Lazily loads and caches the protobuf `FeedMessage` type for decoding GTFS-Realtime payloads.
 *
 * @returns The protobuf `Type` object for `FeedMessage`.
 */
async function getDecoder() {
  if (!FeedMessage) {
    const root = await protobuf.loadSync(config.protoPath)
    FeedMessage = root.lookupType('FeedMessage')
  }
  return FeedMessage
}

/**
 * Fetches a GTFS-Realtime feed from the configured base URL and returns the decoded feed as JSON.
 *
 * @param endpoint - The feed endpoint path segment (e.g. `trip-updates`, `vehicle-positions`)
 * @returns The decoded FeedMessage as a plain JSON object
 * @throws Error if the HTTP response status is not OK (message includes the endpoint and status)
 */
async function fetchFeed(endpoint: string) {
  const decoder = await getDecoder()
  const res = await fetch(`${config.gtfs.realtimeBaseUrl}/${endpoint}`)
  if (!res.ok) throw new Error(`GTFS-RT ${endpoint}: ${res.status}`)
  const buf = new Uint8Array(await res.arrayBuffer())
  return decoder.decode(buf).toJSON()
}

const tripUpdatesCache = createCache<any>(15_000) // 15 сек
const vehicleCache = createCache<any>(15_000) // 15 сек

export const fetchTripUpdates = () => tripUpdatesCache(() => fetchFeed('trip-updates'))
export const fetchVehiclePositions = () => vehicleCache(() => fetchFeed('vehicle-positions'))
