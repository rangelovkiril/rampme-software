import protobuf from 'protobufjs'
import { config } from '../config'
import { createCache } from './cache'
import { getMockBusEntity } from '../services/mock-bus'

let FeedMessage: protobuf.Type

/**
 * Lazily loads and caches the protobuf `FeedMessage` type for decoding GTFS-Realtime payloads.
 *
 * @returns The protobuf `Type` object for `FeedMessage`.
 */
async function getDecoder() {
  if (!FeedMessage) {
    const root = await protobuf.load(config.protoPath)
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

/**
 * Fetches vehicle positions and injects the mock ramp bus entity.
 * The mock bus is NOT cached — it computes a fresh position every call
 * so the frontend sees smooth movement even within the 15-second cache window.
 */
export async function fetchVehiclePositions() {
  const feed = await vehicleCache(() => fetchFeed('vehicle-positions'))

  // Deep-clone so we don't mutate the cached object
  const entity: any[] = Array.isArray(feed.entity) ? [...feed.entity] : []

  // Remove any stale mock entry (e.g. after a hot reload)
  const filtered = entity.filter((e: any) => e.id !== getMockBusEntity().id)

  return {
    ...feed,
    entity: [getMockBusEntity(), ...filtered],
  }
}
