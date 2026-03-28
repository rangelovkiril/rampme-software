import protobuf from 'protobufjs'
import { config } from '../config'
import { createCache } from './cache'
import descriptor from './gtfs-realtime.json'

const root = protobuf.Root.fromJSON(descriptor)
const FeedMessage = root.lookupType('FeedMessage')

async function fetchFeed(endpoint: string) {
  const res = await fetch(`${config.gtfs.realtimeBaseUrl}/${endpoint}`)
  if (!res.ok) throw new Error(`GTFS-RT ${endpoint}: ${res.status}`)
  const buf = new Uint8Array(await res.arrayBuffer())
  return FeedMessage.decode(buf).toJSON()
}

const tripUpdatesCache = createCache<any>(15_000)
const vehicleCache = createCache<any>(15_000)

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
