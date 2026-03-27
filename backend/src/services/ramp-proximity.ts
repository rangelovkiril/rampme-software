import {
  getAllActiveReservations,
  setReservationStatus,
} from '../db/ramp'
import { fetchVehiclePositions } from '../gtfs/realtime'
import { getGtfs } from '../state'

const ARRIVE_RADIUS_M = 10
const DEPART_RADIUS_M = 50
const EXPIRY_SECONDS = 2 * 60 * 60
const CHECK_INTERVAL_MS = 10_000

function distM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6_371_000
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

async function tick(): Promise<void> {
  const data = getGtfs()
  if (!data) return

  const reservations = getAllActiveReservations()
  if (reservations.length === 0) return

  let feed: Awaited<ReturnType<typeof fetchVehiclePositions>>
  try {
    feed = await fetchVehiclePositions()
  } catch {
    return
  }

  const now = Math.floor(Date.now() / 1000)
  const vehicles = new Map<string, { lat: number; lng: number }>()
  for (const e of (feed.entity ?? [])) {
    const v = e.vehicle
    if (v?.vehicle?.id && v.position) {
      vehicles.set(v.vehicle.id, { lat: v.position.latitude, lng: v.position.longitude })
    }
  }

  for (const r of reservations) {
    if (now - r.created_at > EXPIRY_SECONDS) {
      setReservationStatus(r.id, 'expired')
      continue
    }

    const veh = vehicles.get(r.vehicle_id)
    if (!veh) continue
    const stop = data.stops.get(r.stop_id)
    if (!stop) continue

    const d = distM(veh.lat, veh.lng, stop.stop_lat, stop.stop_lon)

    if (r.status === 'pending' && d <= ARRIVE_RADIUS_M) {
      setReservationStatus(r.id, 'active')
    } else if (r.status === 'active' && d > DEPART_RADIUS_M) {
      setReservationStatus(r.id, 'done')
    }
  }
}

let interval: ReturnType<typeof setInterval> | null = null

export function startProximityChecker(): void {
  if (interval) return
  interval = setInterval(() => tick().catch(console.error), CHECK_INTERVAL_MS)
  console.log('[ramp] proximity checker started (10s interval, arrive=10m, depart=50m)')
}

export function stopProximityChecker(): void {
  if (interval) { clearInterval(interval); interval = null }
}
