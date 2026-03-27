import { config } from '../config'
import { getAllActiveReservations, getVehicleHardwareUrl, setReservationStatus } from '../db/ramp'
import { fetchTripUpdates, fetchVehiclePositions } from '../gtfs/realtime'
import { getGtfs } from '../state'

const RADIUS_M = 50
const EXPIRY_SECONDS = 2 * 60 * 60
const VEHICLE_GONE_SECONDS = 15 * 60
const ARRIVAL_WINDOW_SECONDS = 3 * 60
const CHECK_INTERVAL_MS = 5_000
const HARDWARE_TIMEOUT_MS = 2_000

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

/** Fetch hardware status from the device. Returns null on any error. */
async function fetchHardwareStatus(
  url: string,
): Promise<{ at_stop: boolean; stop_id?: string } | null> {
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), HARDWARE_TIMEOUT_MS)
    const res = await fetch(url, { signal: ctrl.signal })
    clearTimeout(timer)
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

function buildVehicleTripMap(feedEntities: any[]): Map<string, string> {
  const map = new Map<string, string>()
  for (const e of feedEntities) {
    const v = e.vehicle
    const vehicleId = v?.vehicle?.id || e.id
    const tripId = v?.trip?.tripId
    if (vehicleId && tripId) map.set(vehicleId, tripId)
  }
  return map
}

async function buildTripPredictions(): Promise<
  Map<string, Map<string, { arrival: number; departure: number }>>
> {
  const map = new Map<string, Map<string, { arrival: number; departure: number }>>()
  try {
    const feed = await fetchTripUpdates()
    for (const e of (feed as any).entity ?? []) {
      const tu = e.tripUpdate
      const tripId: string = tu?.trip?.tripId
      if (!tripId || !tu?.stopTimeUpdate) continue
      const stops = new Map<string, { arrival: number; departure: number }>()
      for (const stu of tu.stopTimeUpdate) {
        if (stu.stopId) {
          stops.set(stu.stopId, {
            arrival: Number(stu.arrival?.time ?? 0),
            departure: Number(stu.departure?.time ?? 0),
          })
        }
      }
      map.set(tripId, stops)
    }
  } catch {
    // trip updates unavailable
  }
  return map
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

  const tripPredictions = await buildTripPredictions()
  const now = Math.floor(Date.now() / 1000)

  const vehicles = new Map<string, { lat: number; lng: number }>()
  const vehicleTrips = buildVehicleTripMap(feedEntities)

  for (const e of feedEntities) {
    const v = e.vehicle
    const vehicleId = v?.vehicle?.id || e.id
    if (vehicleId && v?.position) {
      vehicles.set(vehicleId, {
        lat: v.position.latitude,
        lng: v.position.longitude,
      })
      vehicleLastSeen.set(vehicleId, now)
    }
  }

  // Fetch hardware statuses in parallel for all vehicles with reservations
  const vehicleIds = [...new Set(reservations.map((r) => r.vehicle_id))]
  const hardwareResults = new Map<string, { at_stop: boolean; stop_id?: string } | null>()
  await Promise.all(
    vehicleIds.map(async (vehicleId) => {
      const url = getVehicleHardwareUrl(vehicleId) ?? config.hardwareUrl
      hardwareResults.set(vehicleId, url ? await fetchHardwareStatus(url) : null)
    }),
  )

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
          `[ramp] vehicle ${r.vehicle_id} absent ${VEHICLE_GONE_SECONDS}s - expiring reservation #${r.id}`,
        )
        setReservationStatus(r.id, 'expired')
      }
      continue
    }

    const stop = data.stops.get(r.stop_id)
    if (!stop) continue

    // --- Signal 1: hardware ---
    const hw = hardwareResults.get(r.vehicle_id)
    const hwAtStop = hw?.at_stop === true && (hw.stop_id === undefined || hw.stop_id === r.stop_id)

    // --- Signal 2: GPS ---
    const d = distM(veh.lat, veh.lng, stop.stop_lat, stop.stop_lon)
    const gpsAtStop = d <= RADIUS_M

    // --- Signal 3: trip updates ---
    const tripId = vehicleTrips.get(r.vehicle_id)
    const stopPred = tripId ? tripPredictions.get(tripId)?.get(r.stop_id) : undefined
    const predArrival = stopPred?.arrival ?? 0
    const predDeparture = stopPred?.departure ?? 0
    const tuAtStop =
      predArrival > 0 &&
      predArrival <= now &&
      (predDeparture === 0 || predDeparture > now || now - predDeparture < ARRIVAL_WINDOW_SECONDS)
    const tuDeparted = predDeparture > 0 && predDeparture <= now

    const atStop = hwAtStop || gpsAtStop || tuAtStop

    if (r.status === 'pending' && atStop) {
      const reason = hwAtStop ? 'hardware' : gpsAtStop ? `GPS ${d.toFixed(0)}m` : 'trip-update'
      console.log(
        `[ramp] vehicle ${r.vehicle_id} at stop ${r.stop_id} (${reason}) - reservation #${r.id} ACTIVE`,
      )
      setReservationStatus(r.id, 'active')
    } else if (
      r.status === 'active' &&
      !atStop &&
      d > RADIUS_M &&
      (predDeparture === 0 || tuDeparted)
    ) {
      const reason = tuDeparted ? 'trip-update departure' : `GPS ${d.toFixed(0)}m`
      console.log(
        `[ramp] vehicle ${r.vehicle_id} left stop ${r.stop_id} (${reason}) - reservation #${r.id} DONE`,
      )
      setReservationStatus(r.id, 'done')
    }
  }
}

let interval: ReturnType<typeof setInterval> | null = null

export function startProximityChecker(): void {
  if (interval) return
  interval = setInterval(() => tick().catch(console.error), CHECK_INTERVAL_MS)
  console.log(
    `[ramp] proximity checker started (5s interval, GPS=${RADIUS_M}m + trip-update ETA + hardware)`,
  )
}

export function stopProximityChecker(): void {
  if (interval) {
    clearInterval(interval)
    interval = null
  }
}
