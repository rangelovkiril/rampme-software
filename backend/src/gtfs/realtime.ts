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
export const fetchVehiclePositions = () => vehicleCache(() => fetchFeed('vehicle-positions'))
