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
  let updated = false
  if (trips.status === 'fulfilled') {
    tripUpdatesData = trips.value
    updated = true
  }
  if (vehicles.status === 'fulfilled') {
    vehicleData = vehicles.value
    updated = true
  }
  if (updated) realtimeEvents.emit('refresh')
}

// Fetch data in background independently of SSE push rate; emits 'refresh' on success
refreshFeeds()
setInterval(() => refreshFeeds().catch(() => {}), REFRESH_INTERVAL_MS)

export function fetchTripUpdates() {
  if (!tripUpdatesData) return fetchFeed('trip-updates')
  return Promise.resolve(tripUpdatesData)
}

export function fetchVehiclePositions() {
  if (!vehicleData) return fetchFeed('vehicle-positions')
  return Promise.resolve(vehicleData)
}
