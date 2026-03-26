import protobuf from 'protobufjs'
import { config } from '../config'
import { createCache } from './cache'

let FeedMessage: protobuf.Type

async function getDecoder() {
  if (!FeedMessage) {
    const root = await protobuf.load(config.protoPath)
    FeedMessage = root.lookupType('FeedMessage')
  }
  return FeedMessage
}

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
