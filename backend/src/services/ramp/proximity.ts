/**
 * proximity.ts — GPS proximity detection.
 *
 * Single responsibility: when a vehicle's GPS position is within RADIUS_M
 * of a stop that has pending reservations for that vehicle, publish a
 * deploy command over MQTT. Everything after that is hardware's job.
 *
 * Also: expires reservations whose vehicle has been absent from the RT feed
 * for too long, or whose creation time is older than EXPIRY_SECONDS.
 */

import { consola } from 'consola'
import type { RampDb } from '../../db/ramp'
import type { GtfsData, GtfsRtFeedEntity, GtfsRtFeedMessage } from '../../gtfs/types'
import type { RampBridge } from './bridge'

const log = consola.withTag('proximity')

const RADIUS_M = 50
const EXPIRY_SECONDS = 2 * 60 * 60
const VEHICLE_GONE_SECONDS = 15 * 60
const CHECK_INTERVAL_MS = 5_000

export interface ProximityCheckerConfig {
  radiusM?: number
  expirySeconds?: number
  vehicleGoneSeconds?: number
  checkIntervalMs?: number
}

export interface ProximityChecker {
  tick(): Promise<void>
  start(): void
  stop(): void
}

function distM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6_371_000
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/**
 * Builds an independent ProximityChecker over the given dependencies.
 * `getBridge`/`getGtfs` are getters (not resolved instances) because the
 * ramp bridge may not exist yet when the checker is constructed (MQTT
 * connects asynchronously, or never) and GTFS data is refreshed
 * periodically — a snapshot would go stale. `rampDb`/`fetchPositions` are
 * resolved values since both are available synchronously at construction.
 * Production wires a single instance and calls start(); tests call
 * tick() directly, bypassing the interval.
 */
export function createProximityChecker(
  getBridge: () => RampBridge,
  getGtfs: () => GtfsData | undefined,
  rampDb: RampDb,
  fetchPositions: () => Promise<GtfsRtFeedMessage>,
  config: ProximityCheckerConfig = {},
): ProximityChecker {
  const radiusM = config.radiusM ?? RADIUS_M
  const expirySeconds = config.expirySeconds ?? EXPIRY_SECONDS
  const vehicleGoneSeconds = config.vehicleGoneSeconds ?? VEHICLE_GONE_SECONDS
  const checkIntervalMs = config.checkIntervalMs ?? CHECK_INTERVAL_MS

  const vehicleLastSeen = new Map<string, number>()
  let interval: ReturnType<typeof setInterval> | null = null

  async function tick(): Promise<void> {
    const data = getGtfs()
    if (!data) return

    const reservations = rampDb.getAllActiveReservations()
    if (reservations.length === 0) return

    let feedEntities: GtfsRtFeedEntity[]
    try {
      const feed = await fetchPositions()
      feedEntities = feed.entity ?? []
    } catch {
      return
    }

    const now = Math.floor(Date.now() / 1000)
    const vehicles = new Map<string, { lat: number; lng: number }>()

    for (const e of feedEntities) {
      const v = e.vehicle
      const vehicleId = v?.vehicle?.id || e.id
      if (vehicleId && v?.position) {
        vehicles.set(vehicleId, { lat: v.position.latitude, lng: v.position.longitude })
        vehicleLastSeen.set(vehicleId, now)
      }
    }

    for (const r of reservations) {
      if (now - r.created_at > expirySeconds) {
        rampDb.setReservationStatus(r.id, 'expired')
        continue
      }

      const veh = vehicles.get(r.vehicle_id)
      if (!veh) {
        const lastSeen = vehicleLastSeen.get(r.vehicle_id) ?? r.created_at
        if (now - lastSeen > vehicleGoneSeconds) {
          log.warn(`vehicle ${r.vehicle_id} absent ${vehicleGoneSeconds}s — expiring #${r.id}`)
          rampDb.setReservationStatus(r.id, 'expired')
        }
        continue
      }

      const stop = data.stops.get(r.stop_id)
      if (!stop) continue

      const d = distM(veh.lat, veh.lng, stop.stop_lat, stop.stop_lon)
      const atStop = d <= radiusM
      const bridge = getBridge()

      if (atStop && r.status === 'pending' && !bridge.isDeployInFlight(r.vehicle_id)) {
        log.info(
          `vehicle ${r.vehicle_id} at stop ${r.stop_id} (${d.toFixed(0)}m) — triggering deploy for #${r.id}`,
        )
        bridge.markDeployTriggered(r.vehicle_id, r.stop_id)
        bridge.publishDeploy(r.vehicle_id)
      }

      // If vehicle moved away from a previously-deployed stop, clear the flag
      // so future reservations at other stops can trigger again.
      if (!atStop && bridge.wasDeployTriggered(r.vehicle_id, r.stop_id) && d > radiusM * 2) {
        bridge.clearDeployTrigger(r.vehicle_id)
      }
    }
  }

  function start(): void {
    if (interval) return
    interval = setInterval(() => tick().catch((e) => log.error(e)), checkIntervalMs)
    log.info(`started (${checkIntervalMs}ms interval, radius=${radiusM}m)`)
  }

  function stop(): void {
    if (interval) {
      clearInterval(interval)
      interval = null
    }
  }

  return { tick, start, stop }
}
