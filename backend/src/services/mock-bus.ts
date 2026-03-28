/**
 * Mock bus that moves along 4 stops in a loop, emitting a valid GTFS-RT
 * VehiclePosition entity. The vehicle always has a ramp.
 *
 * Coordinates (DMS → decimal):
 *   Stop 0: 42°39'56.2"N  23°22'32.0"E  →  42.665611, 23.375556
 *   Stop 1: 42°40'03.1"N  23°22'22.2"E  →  42.667528, 23.372833
 *   Stop 2: 42°40'05.2"N  23°22'25.0"E  →  42.668111, 23.373611
 *   Stop 3: 42°39'58.5"N  23°22'34.6"E  →  42.666250, 23.376278
 */

export const MOCK_BUS_ID = 'MOCK-RAMP-001'

// ── Route / trip metadata (fake but realistic-looking) ───────────────────────
const MOCK_ROUTE_ID = 'mock-r-99'
const MOCK_TRIP_ID = 'mock-t-99-1'
const MOCK_LABEL = 'Line 99'
const MOCK_START_TIME = '08:00:00'
const MOCK_START_DATE = '20240101'

// ── Stops ────────────────────────────────────────────────────────────────────
export interface StopNode {
  lat: number
  lng: number
  stopId: string
  stopName: string
}

export const MOCK_STOPS: StopNode[] = [
  { lat: 42.665611, lng: 23.375556, stopId: 'mock-stop-0', stopName: 'Бул. Цариградско шосе' },
  { lat: 42.667528, lng: 23.372833, stopId: 'mock-stop-1', stopName: 'Централна гара' },
  { lat: 42.668111, lng: 23.373611, stopId: 'mock-stop-2', stopName: 'Пл. Лъвов мост' },
  { lat: 42.66625, lng: 23.376278, stopId: 'mock-stop-3', stopName: 'Бул. Христо Ботев' },
]

// ── Geometry helpers ─────────────────────────────────────────────────────────
function distM(a: StopNode, b: StopNode): number {
  const R = 6_371_000
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLon = ((b.lng - a.lng) * Math.PI) / 180
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s))
}

function bearingDeg(a: StopNode, b: StopNode): number {
  const lat1 = (a.lat * Math.PI) / 180
  const lat2 = (b.lat * Math.PI) / 180
  const dLon = ((b.lng - a.lng) * Math.PI) / 180
  const y = Math.sin(dLon) * Math.cos(lat2)
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon)
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360
}

// ── Legs & timing ────────────────────────────────────────────────────────────
const SPEED_MS = 8 // ~29 km/h — city bus pace
const DWELL_SEC = 12 // seconds stopped at each terminus

interface Leg {
  from: StopNode
  to: StopNode
  dist: number
  travelSec: number
  /** offset into the loop at which travel on this leg starts */
  startOffset: number
}

function buildLegs(): Leg[] {
  const n = MOCK_STOPS.length
  const legs: Leg[] = []
  let offset = 0

  for (let i = 0; i < n; i++) {
    const from = MOCK_STOPS[i]
    const to = MOCK_STOPS[(i + 1) % n]
    const dist = distM(from, to)
    const travelSec = dist / SPEED_MS

    legs.push({ from, to, dist, travelSec, startOffset: offset })
    offset += travelSec + DWELL_SEC
  }
  return legs
}

export const LEGS = buildLegs()
export const LOOP_SEC = LEGS.reduce((s, l) => s + l.travelSec + DWELL_SEC, 0)

// ── Position computation ─────────────────────────────────────────────────────
export interface MockBusPosition {
  lat: number
  lng: number
  bearing: number
  speed: number
  stopId: string
  legIndex: number
  tMs: number
}

export function computeMockBusPosition(nowMs = Date.now()): MockBusPosition {
  const t = (nowMs / 1000) % LOOP_SEC

  let leg = LEGS[LEGS.length - 1]
  let legIdx = LEGS.length - 1

  for (let i = LEGS.length - 1; i >= 0; i--) {
    if (t >= LEGS[i].startOffset) {
      leg = LEGS[i]
      legIdx = i
      break
    }
  }

  const elapsed = t - leg.startOffset

  if (elapsed >= leg.travelSec) {
    return {
      lat: leg.to.lat,
      lng: leg.to.lng,
      bearing: bearingDeg(leg.from, leg.to),
      speed: 0,
      stopId: leg.to.stopId,
      legIndex: legIdx,
      tMs: nowMs,
    }
  }

  const frac = elapsed / leg.travelSec
  return {
    lat: leg.from.lat + (leg.to.lat - leg.from.lat) * frac,
    lng: leg.from.lng + (leg.to.lng - leg.from.lng) * frac,
    bearing: bearingDeg(leg.from, leg.to),
    speed: SPEED_MS,
    stopId: leg.to.stopId,
    legIndex: legIdx,
    tMs: nowMs,
  }
}

// ── GTFS-RT entity builder ───────────────────────────────────────────────────
export function getMockBusEntity() {
  const pos = computeMockBusPosition()

  return {
    id: MOCK_BUS_ID,
    vehicle: {
      trip: {
        tripId: MOCK_TRIP_ID,
        routeId: MOCK_ROUTE_ID,
        startTime: MOCK_START_TIME,
        startDate: MOCK_START_DATE,
        directionId: 0,
      },
      vehicle: {
        id: MOCK_BUS_ID,
        label: MOCK_LABEL,
      },
      position: {
        latitude: pos.lat,
        longitude: pos.lng,
        bearing: pos.bearing,
        speed: pos.speed,
      },
      timestamp: Math.floor(pos.tMs / 1000),
    },
  }
}

// ── Mock trip details (for /realtime/vehicles/:id/trip) ───────────────────────
/** Returns a TripDetailResult-shaped object for the mock bus with live ETAs. */
export function getMockTripDetails() {
  const nowMs = Date.now()
  const t = (nowMs / 1000) % LOOP_SEC
  const n = MOCK_STOPS.length

  // arrival offset for stop j = moment in loop when bus arrives at stop j
  // stop j is the destination of leg (j-1+n)%n
  const arrivalOffset: number[] = MOCK_STOPS.map((_, j) => {
    const inboundLeg = LEGS[(j - 1 + n) % n]
    return inboundLeg.startOffset + inboundLeg.travelSec
  })

  // current leg
  let legIdx = LEGS.length - 1
  for (let i = LEGS.length - 1; i >= 0; i--) {
    if (t >= LEGS[i].startOffset) {
      legIdx = i
      break
    }
  }
  const leg = LEGS[legIdx]
  const elapsed = t - leg.startOffset
  const isDwelling = elapsed >= leg.travelSec

  // next stop index = destination of current leg
  const nextStopIdx = (legIdx + 1) % n

  // seconds until bus arrives at next stop
  const etaToNext = isDwelling ? 0 : leg.travelSec - elapsed

  const stops = MOCK_STOPS.map((stop, j) => {
    // how many stops ahead is j from nextStopIdx?
    const stepsAhead = (j - nextStopIdx + n) % n

    let etaSec: number
    let status: 'departed' | 'on_time' | 'scheduled'

    if (stepsAhead === 0) {
      // this IS the next stop
      etaSec = etaToNext
      status = isDwelling ? 'on_time' : 'on_time'
    } else if (stepsAhead < n) {
      // upcoming stop — sum ETAs through intermediate dwells + legs
      let acc = etaToNext + DWELL_SEC // after arriving at next, dwell, then go
      for (let k = 1; k < stepsAhead; k++) {
        const li = (nextStopIdx + k - 1 + n) % n // leg index heading to stop nextStopIdx+k
        // leg li goes from stop (nextStopIdx+k-1) to stop (nextStopIdx+k)
        const legForward = LEGS[(nextStopIdx + k - 1 + n) % n]
        acc += legForward.travelSec + DWELL_SEC
      }
      // replace last DWELL_SEC addition with arrival (no dwell counted, bus arrives)
      // actually acc = etaToNext + stepsAhead * DWELL_SEC + sum of intermediate travelSec
      // simpler: recompute cleanly
      acc = etaToNext
      for (let k = 0; k < stepsAhead; k++) {
        acc += DWELL_SEC + LEGS[(nextStopIdx + k) % n].travelSec
      }
      // That overshoots — "acc" after k iterations ends PAST the stop.
      // Correct: arrive at stop j = etaToNext + sum_{k=0}^{stepsAhead-1}(DWELL + leg[nextStopIdx+k].travelSec)
      // But we want ETA to the stop, not after dwelling. The last term should not include DWELL.
      acc = etaToNext
      for (let k = 0; k < stepsAhead; k++) {
        if (k < stepsAhead - 1) {
          acc += DWELL_SEC + LEGS[(nextStopIdx + k) % n].travelSec
        } else {
          acc += DWELL_SEC + LEGS[(nextStopIdx + k) % n].travelSec
        }
      }
      etaSec = acc
      status = 'scheduled'
    } else {
      // already visited this loop cycle
      etaSec = 0
      status = 'departed'
    }

    const etaMin = Math.max(0, Math.round(etaSec / 60))
    const arrivalMs = nowMs + etaSec * 1000
    const arrDate = new Date(arrivalMs)
    const hh = String(arrDate.getHours()).padStart(2, '0')
    const mm = String(arrDate.getMinutes()).padStart(2, '0')
    const expectedTime = status === 'departed' ? null : `${hh}:${mm}`

    return {
      stop_id: stop.stopId,
      stop_name: stop.stopName,
      stop_sequence: j + 1,
      scheduled_time: expectedTime ?? '--:--',
      expected_time: expectedTime,
      eta_minutes: status === 'departed' ? 0 : etaMin,
      status,
      delay_minutes: 0,
      realtime: true,
    }
  })

  return {
    vehicle_id: MOCK_BUS_ID,
    trip_id: MOCK_TRIP_ID,
    route_id: MOCK_ROUTE_ID,
    route_short_name: MOCK_LABEL,
    route_type: 3, // bus
    headsign: `${MOCK_STOPS[nextStopIdx].stopName} →`,
    stops,
  }
}

// ── Debug / status ───────────────────────────────────────────────────────────
export function getMockBusStatus() {
  const pos = computeMockBusPosition()
  const leg = LEGS[pos.legIndex]
  return {
    vehicleId: MOCK_BUS_ID,
    routeId: MOCK_ROUTE_ID,
    tripId: MOCK_TRIP_ID,
    loopDurationSec: Math.round(LOOP_SEC),
    currentLeg: {
      index: pos.legIndex,
      from: leg.from.stopId,
      to: leg.to.stopId,
    },
    position: {
      lat: pos.lat,
      lng: pos.lng,
      bearing: Math.round(pos.bearing),
      speedKmh: Math.round(pos.speed * 3.6),
    },
    stops: MOCK_STOPS.map((s, i) => ({ index: i, ...s })),
  }
}
