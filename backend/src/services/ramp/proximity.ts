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

import { getAllActiveReservations, setReservationStatus } from '../../db/ramp'
import { fetchVehiclePositions } from '../../gtfs/realtime'
import { getGtfs } from '../state'
import {
  clearDeployTrigger,
  isDeployInFlight,
  markDeployTriggered,
  publishDeploy,
  wasDeployTriggered,
} from './bridge'

const RADIUS_M = 50
const EXPIRY_SECONDS = 2 * 60 * 60
const VEHICLE_GONE_SECONDS = 15 * 60
const CHECK_INTERVAL_MS = 5_000

const vehicleLastSeen = new Map<string, number>()

function distM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6_371_000
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

async function tick(): Promise<void> {
  const data = getGtfs()
  if (!data) return

  const reservations = getAllActiveReservations()
  if (reservations.length === 0) return

  let feedEntities: any[]
  try {
    const feed = await fetchVehiclePositions()
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
    if (now - r.created_at > EXPIRY_SECONDS) {
      setReservationStatus(r.id, 'expired')
      continue
    }

    const veh = vehicles.get(r.vehicle_id)
    if (!veh) {
      const lastSeen = vehicleLastSeen.get(r.vehicle_id) ?? r.created_at
      if (now - lastSeen > VEHICLE_GONE_SECONDS) {
        console.log(
          `[proximity] vehicle ${r.vehicle_id} absent ${VEHICLE_GONE_SECONDS}s — expiring #${r.id}`,
        )
        setReservationStatus(r.id, 'expired')
      }
      continue
    }

    const stop = data.stops.get(r.stop_id)
    if (!stop) continue

    const d = distM(veh.lat, veh.lng, stop.stop_lat, stop.stop_lon)
    const atStop = d <= RADIUS_M

    if (atStop && r.status === 'pending' && !isDeployInFlight(r.vehicle_id)) {
      console.log(
        `[proximity] vehicle ${r.vehicle_id} at stop ${r.stop_id} (${d.toFixed(0)}m) — triggering deploy for #${r.id}`,
      )
      markDeployTriggered(r.vehicle_id, r.stop_id)
      publishDeploy(r.vehicle_id)
    }

    // If vehicle moved away from a previously-deployed stop, clear the flag
    // so future reservations at other stops can trigger again.
    if (!atStop && wasDeployTriggered(r.vehicle_id, r.stop_id) && d > RADIUS_M * 2) {
      clearDeployTrigger(r.vehicle_id)
    }
  }
}

let interval: ReturnType<typeof setInterval> | null = null

export function startProximityChecker(): void {
  if (interval) return
  interval = setInterval(() => tick().catch(console.error), CHECK_INTERVAL_MS)
  console.log(`[proximity] started (${CHECK_INTERVAL_MS}ms interval, radius=${RADIUS_M}m)`)
}
