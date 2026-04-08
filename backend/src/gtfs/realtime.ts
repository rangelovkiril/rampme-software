import { EventEmitter } from 'node:events'
import protobuf from 'protobufjs'
import { config } from '../config'
import { getMockBusEntity } from '../services/mock-bus'
import descriptor from './gtfs-realtime.json'

const root = protobuf.Root.fromJSON(descriptor)
const FeedMessage = root.lookupType('FeedMessage')

async function fetchFeed(endpoint: string) {
  const res = await fetch(`${config.gtfs.realtimeBaseUrl}/${endpoint}`)
  if (!res.ok) throw new Error(`GTFS-RT ${endpoint}: ${res.status}`)
  const buf = new Uint8Array(await res.arrayBuffer())
  return FeedMessage.decode(buf).toJSON()
}

const REFRESH_INTERVAL_MS = 5_000

let tripUpdatesData: any = null
let vehicleData: any = null

// Emits 'refresh' after every successful feed update so SSE streams can push to clients
export const realtimeEvents = new EventEmitter()
realtimeEvents.setMaxListeners(0)

async function refreshFeeds() {
  const [trips, vehicles] = await Promise.allSettled([
    fetchFeed('trip-updates'),
    fetchFeed('vehicle-positions'),
  ])
  if (trips.status === 'fulfilled') tripUpdatesData = trips.value
  if (vehicles.status === 'fulfilled') vehicleData = vehicles.value
  realtimeEvents.emit('refresh')
}

// Initial fetch, then refresh every 5s
refreshFeeds()
setInterval(() => refreshFeeds().catch(() => {}), REFRESH_INTERVAL_MS)

export function fetchTripUpdates() {
  if (!tripUpdatesData) return fetchFeed('trip-updates')
  return Promise.resolve(tripUpdatesData)
}

/**
 * Returns cached vehicle positions and injects the mock ramp bus entity.
 * The mock bus computes a fresh position every call for smooth movement.
 */
export async function fetchVehiclePositions() {
  const feed = vehicleData ?? (await fetchFeed('vehicle-positions'))

  // Deep-clone so we don't mutate the cached object
  const entity: any[] = Array.isArray(feed.entity) ? [...feed.entity] : []

  // Remove any stale mock entry (e.g. after a hot reload)
  const filtered = entity.filter((e: any) => e.id !== getMockBusEntity().id)

  return {
    ...feed,
    entity: [getMockBusEntity(), ...filtered],
  }
}
