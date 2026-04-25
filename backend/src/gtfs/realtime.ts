import { EventEmitter } from 'node:events'
import protobuf from 'protobufjs'
import { config } from '../config'
import descriptor from './gtfs-realtime.json'

const root = protobuf.Root.fromJSON(descriptor)
const FeedMessage = root.lookupType('FeedMessage')

async function fetchFeed(endpoint: string) {
  const res = await fetch(`${config.gtfs.realtimeBaseUrl}/${endpoint}`, {
    signal: AbortSignal.timeout(4_000),
  })
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
}

// Fetch data in background independently of SSE push rate
refreshFeeds()
setInterval(() => refreshFeeds().catch(() => {}), REFRESH_INTERVAL_MS)

// Push to SSE clients every 5s regardless of fetch timing
setInterval(() => realtimeEvents.emit('refresh'), REFRESH_INTERVAL_MS)

export function fetchTripUpdates() {
  if (!tripUpdatesData) return fetchFeed('trip-updates')
  return Promise.resolve(tripUpdatesData)
}

export function fetchVehiclePositions() {
  if (!vehicleData) return fetchFeed('vehicle-positions')
  return Promise.resolve(vehicleData)
}
