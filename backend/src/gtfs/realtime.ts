import protobuf from 'protobufjs'
import { config } from '../config'
import { Broadcaster } from '../services/broadcaster'
import { FeedTracker } from './feed-health'
import descriptor from './gtfs-realtime.json'
import type { GtfsRtFeedMessage } from './types'

const root = protobuf.Root.fromJSON(descriptor)
const FeedMessage = root.lookupType('FeedMessage')

/**
 * Decodes raw GTFS-RT protobuf bytes. FeedMessage.decode() enforces the
 * .proto shape at the wire level, so a single assertion here is enough to
 * type the rest of the codebase. No network — tests can call this directly
 * against fixture bytes instead of a live fetch.
 */
export function decodeFeedMessage(buf: Uint8Array): GtfsRtFeedMessage {
  return FeedMessage.decode(buf).toJSON() as GtfsRtFeedMessage
}

async function fetchFeed(endpoint: string): Promise<GtfsRtFeedMessage> {
  const res = await fetch(`${config.gtfs.realtimeBaseUrl}/${endpoint}`, {
    signal: AbortSignal.timeout(4_000),
  })
  if (!res.ok) throw new Error(`GTFS-RT ${endpoint}: ${res.status}`)
  return decodeFeedMessage(new Uint8Array(await res.arrayBuffer()))
}

const REFRESH_INTERVAL_MS = 5_000

export interface FeedHealthSnapshot {
  tripUpdates: { stale: boolean }
  vehiclePositions: { stale: boolean }
}

export interface GtfsRealtimeTick {
  tick: number
  feeds: FeedHealthSnapshot
}

let tripUpdatesData: GtfsRtFeedMessage | null = null
let vehicleData: GtfsRtFeedMessage | null = null

const tripUpdatesTracker = new FeedTracker(config.gtfs.staleThresholdMs)
const vehiclePositionsTracker = new FeedTracker(config.gtfs.staleThresholdMs)

// Publishes a tick after every push cadence, letting SSE streams re-fetch
// their own data through the generic transport helper.
export const gtfsRealtimeBroadcaster = new Broadcaster<GtfsRealtimeTick>()

/**
 * Pure aggregation, kept separate from the module's singleton trackers so
 * both `getFeedHealth()` (used identically by every consumer — SSE streams
 * and the plain JSON route — so they can never disagree) and tests can
 * exercise it without depending on real fetches or wall-clock timing.
 */
export function computeFeedHealth(
  tripUpdates: FeedTracker,
  vehiclePositions: FeedTracker,
): FeedHealthSnapshot {
  return {
    tripUpdates: { stale: tripUpdates.stale },
    vehiclePositions: { stale: vehiclePositions.stale },
  }
}

export function getFeedHealth(): FeedHealthSnapshot {
  return computeFeedHealth(tripUpdatesTracker, vehiclePositionsTracker)
}

async function refreshFeeds() {
  const [trips, vehicles] = await Promise.allSettled([
    fetchFeed('trip-updates'),
    fetchFeed('vehicle-positions'),
  ])
  if (trips.status === 'fulfilled') {
    tripUpdatesData = trips.value
    tripUpdatesTracker.recordSuccess()
  }
  if (vehicles.status === 'fulfilled') {
    vehicleData = vehicles.value
    vehiclePositionsTracker.recordSuccess()
  }
}

/**
 * Publishes a tick on a fixed cadence, independent of whether `refreshFeeds`
 * ever succeeds — an upstream GTFS-RT stall must never freeze the UI.
 * Deliberately has no dependency on fetch/network so this guarantee holds
 * structurally, not just by convention (regression guard for `b1023fc`).
 */
export function startPushLoop(
  broadcaster: Broadcaster<GtfsRealtimeTick>,
  getHealth: () => FeedHealthSnapshot,
  intervalMs: number,
): () => void {
  let tick = 0
  const timer = setInterval(() => {
    tick++
    broadcaster.publish({ tick, feeds: getHealth() })
  }, intervalMs)
  return () => clearInterval(timer)
}

// Fetch data in background independently of the push rate.
refreshFeeds()
setInterval(() => refreshFeeds().catch(() => {}), REFRESH_INTERVAL_MS)

// Push to SSE clients on a fixed cadence, regardless of upstream fetch timing
// or success — clients get the latest cached (possibly slightly stale) data
// instead of nothing.
startPushLoop(gtfsRealtimeBroadcaster, getFeedHealth, REFRESH_INTERVAL_MS)

export function fetchTripUpdates() {
  if (!tripUpdatesData) return fetchFeed('trip-updates')
  return Promise.resolve(tripUpdatesData)
}

export function fetchVehiclePositions() {
  if (!vehicleData) return fetchFeed('vehicle-positions')
  return Promise.resolve(vehicleData)
}
