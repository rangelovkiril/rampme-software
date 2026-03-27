import type { Stop } from '../gtfs/types'
import { getVehicleReservations, setReservationStatus } from '../db/ramp'

type TripStopStatus = 'departed' | 'delay' | 'on_time' | 'scheduled'

interface MockStopDef {
  id: string
  name: string
  lat: number
  lon: number
}

interface MockVehicleSnapshot {
  id: string
  tripId: string
  lat: number
  lng: number
  bearing: number
  speed: number
  route_id: string
  route_short_name: string
  route_type: number
  headsign: string
}

interface MockTripStop {
  stop_id: string
  stop_name: string
  stop_sequence: number
  scheduled_time: string
  expected_time: string
  eta_minutes: number
  status: TripStopStatus
  delay_minutes: number
  realtime: boolean
}

interface MockTripDetail {
  vehicle_id: string
  trip_id: string
  route_id: string
  route_short_name: string
  route_type: number
  headsign: string
  stops: MockTripStop[]
}

interface MockArrival {
  id: string
  vehicle_id: string
  route_short_name: string
  route_type: number
  headsign: string
  route_id: string
  scheduled_time: string
  expected_time: string
  eta_minutes: number
  realtime: boolean
  has_ramp: boolean
}

const MOCK_ROUTE_ID = 'MOCK_R1'
const MOCK_TRIP_ID = 'MOCK_T1'
const MOCK_VEHICLE_ID = 'MOCK_V1'
const MOCK_ROUTE_SHORT_NAME = 'R1'

const ARRIVE_RADIUS_M = 10
const BASE_STOP_SECONDS = 4
const RAMP_STOP_SECONDS = 30
const SPEED_MPS = 8

const MOCK_STOPS: MockStopDef[] = [
  { id: 'MOCK_S1', name: 'Тех Парк', lat: 42.661849, lon: 23.380014 },
  { id: 'MOCK_S2', name: 'Джон Атанасов', lat: 42.66577, lon: 23.375646 },
  { id: 'MOCK_S3', name: 'Резиденция', lat: 42.668284, lon: 23.371784 },
]

interface SimulationState {
  fromIdx: number
  toIdx: number
  progress: number
  lat: number
  lng: number
  bearing: number
  speedKmh: number
  dwellUntilMs: number
  servedReservationIds: number[]
  lastUpdateMs: number
}

const nowMs = Date.now()
const initial = MOCK_STOPS[0]
const initialBearing = bearingDeg(initial.lat, initial.lon, MOCK_STOPS[1].lat, MOCK_STOPS[1].lon)

const state: SimulationState = {
  fromIdx: 0,
  toIdx: 1,
  progress: 0,
  lat: initial.lat,
  lng: initial.lon,
  bearing: initialBearing,
  speedKmh: 0,
  dwellUntilMs: nowMs + BASE_STOP_SECONDS * 1000,
  servedReservationIds: [],
  lastUpdateMs: nowMs,
}

const mockStopsAsGtfs: Stop[] = MOCK_STOPS.map((s) => ({
  stop_id: s.id,
  stop_code: s.id,
  stop_name: s.name,
  stop_lat: s.lat,
  stop_lon: s.lon,
  wheelchair_boarding: 1,
}))

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

function bearingDeg(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const p1 = (lat1 * Math.PI) / 180
  const p2 = (lat2 * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180

  const y = Math.sin(dLon) * Math.cos(p2)
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dLon)
  const brng = (Math.atan2(y, x) * 180) / Math.PI
  return (brng + 360) % 360
}

function interpolate(from: MockStopDef, to: MockStopDef, t: number): { lat: number; lng: number } {
  return {
    lat: from.lat + (to.lat - from.lat) * t,
    lng: from.lon + (to.lon - from.lon) * t,
  }
}

function hhmm(unixMs: number): string {
  const d = new Date(unixMs)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function activeReservationsForStop(stopId: string) {
  return getVehicleReservations(MOCK_VEHICLE_ID).filter(
    (r) => r.stop_id === stopId && (r.status === 'pending' || r.status === 'active'),
  )
}

function finishServedReservations() {
  for (const id of state.servedReservationIds) {
    setReservationStatus(id, 'done')
  }
  state.servedReservationIds = []
}

function beginDwellAtStop(stopIdx: number, atMs: number) {
  const stop = MOCK_STOPS[stopIdx]
  const resAtStop = activeReservationsForStop(stop.id)

  const servedIds: number[] = []
  for (const r of resAtStop) {
    if (r.status === 'pending') setReservationStatus(r.id, 'active')
    servedIds.push(r.id)
  }

  state.fromIdx = stopIdx
  state.toIdx = (stopIdx + 1) % MOCK_STOPS.length
  state.progress = 0
  state.lat = stop.lat
  state.lng = stop.lon
  state.speedKmh = 0
  state.bearing = bearingDeg(stop.lat, stop.lon, MOCK_STOPS[state.toIdx].lat, MOCK_STOPS[state.toIdx].lon)
  state.servedReservationIds = servedIds

  const holdSeconds = servedIds.length > 0 ? RAMP_STOP_SECONDS : BASE_STOP_SECONDS
  state.dwellUntilMs = atMs + holdSeconds * 1000
}

function moveToProgress(progress: number) {
  const from = MOCK_STOPS[state.fromIdx]
  const to = MOCK_STOPS[state.toIdx]
  const p = Math.min(Math.max(progress, 0), 1)
  const pos = interpolate(from, to, p)
  state.progress = p
  state.lat = pos.lat
  state.lng = pos.lng
  state.bearing = bearingDeg(from.lat, from.lon, to.lat, to.lon)
  state.speedKmh = SPEED_MPS * 3.6
}

function legDistance(fromIdx: number, toIdx: number): number {
  const from = MOCK_STOPS[fromIdx]
  const to = MOCK_STOPS[toIdx]
  return Math.max(0.1, distM(from.lat, from.lon, to.lat, to.lon))
}

function advanceToNow() {
  const targetMs = Date.now()
  if (targetMs <= state.lastUpdateMs) return

  while (state.lastUpdateMs < targetMs) {
    // Dwell phase
    if (state.dwellUntilMs > state.lastUpdateMs) {
      if (state.dwellUntilMs >= targetMs) {
        state.lastUpdateMs = targetMs
        return
      }

      state.lastUpdateMs = state.dwellUntilMs
      if (state.servedReservationIds.length > 0) finishServedReservations()
      state.dwellUntilMs = 0
      continue
    }

    // Moving phase
    const from = MOCK_STOPS[state.fromIdx]
    const to = MOCK_STOPS[state.toIdx]
    const totalDist = legDistance(state.fromIdx, state.toIdx)
    const remainingDist = totalDist * (1 - state.progress)
    const timeToStopMs = (remainingDist / SPEED_MPS) * 1000
    const stopAtMs = state.lastUpdateMs + timeToStopMs
    const phaseEndMs = Math.min(stopAtMs, targetMs)

    const reservationsAtNextStop = activeReservationsForStop(to.id)
    if (reservationsAtNextStop.length > 0) {
      const timeToRadiusMs = Math.max(0, ((remainingDist - ARRIVE_RADIUS_M) / SPEED_MPS) * 1000)
      const radiusReachedAt = state.lastUpdateMs + timeToRadiusMs

      if (radiusReachedAt <= phaseEndMs) {
        state.lastUpdateMs = radiusReachedAt
        beginDwellAtStop(state.toIdx, radiusReachedAt)
        continue
      }
    }

    if (stopAtMs <= targetMs) {
      state.lastUpdateMs = stopAtMs
      beginDwellAtStop(state.toIdx, stopAtMs)
      continue
    }

    const dtMs = targetMs - state.lastUpdateMs
    const dtSec = dtMs / 1000
    const stepProgress = (dtSec * SPEED_MPS) / totalDist
    moveToProgress(state.progress + stepProgress)
    state.lastUpdateMs = targetMs

    // Keep heading stable while en route
    state.bearing = bearingDeg(from.lat, from.lon, to.lat, to.lon)
  }
}

function estimateEtaSeconds(stopId: string): number | null {
  advanceToNow()

  const stopIdx = MOCK_STOPS.findIndex((s) => s.id === stopId)
  if (stopIdx < 0) return null

  if (state.dwellUntilMs > state.lastUpdateMs && stopIdx === state.fromIdx) {
    return 0
  }

  let seconds = 0

  if (state.dwellUntilMs > state.lastUpdateMs) {
    seconds += (state.dwellUntilMs - state.lastUpdateMs) / 1000
    let prev = state.fromIdx
    let idx = state.toIdx

    for (let i = 0; i < MOCK_STOPS.length; i++) {
      seconds += legDistance(prev, idx) / SPEED_MPS
      if (idx === stopIdx) return Math.max(0, Math.round(seconds))
      prev = idx
      idx = (idx + 1) % MOCK_STOPS.length
    }
    return null
  }

  const toSeconds = (legDistance(state.fromIdx, state.toIdx) * (1 - state.progress)) / SPEED_MPS
  seconds += toSeconds
  if (state.toIdx === stopIdx) return Math.max(0, Math.round(seconds))

  let prev = state.toIdx
  let idx = (state.toIdx + 1) % MOCK_STOPS.length
  for (let i = 0; i < MOCK_STOPS.length; i++) {
    seconds += legDistance(prev, idx) / SPEED_MPS
    if (idx === stopIdx) return Math.max(0, Math.round(seconds))
    prev = idx
    idx = (idx + 1) % MOCK_STOPS.length
  }

  return null
}

function currentHeadsign(): string {
  advanceToNow()
  return MOCK_STOPS[state.toIdx]?.name ?? MOCK_STOPS[0].name
}

export function isMockVehicleId(vehicleId: string): boolean {
  return vehicleId === MOCK_VEHICLE_ID
}

export function getMockStops(): Stop[] {
  return mockStopsAsGtfs
}

export function getMockStopById(stopId: string): Stop | null {
  return mockStopsAsGtfs.find((s) => s.stop_id === stopId) ?? null
}

export function getMockVehicleSnapshot(): MockVehicleSnapshot {
  advanceToNow()
  return {
    id: MOCK_VEHICLE_ID,
    tripId: MOCK_TRIP_ID,
    lat: state.lat,
    lng: state.lng,
    bearing: Number.isFinite(state.bearing) ? state.bearing : 0,
    speed: Number.isFinite(state.speedKmh) ? Number(state.speedKmh.toFixed(1)) : 0,
    route_id: MOCK_ROUTE_ID,
    route_short_name: MOCK_ROUTE_SHORT_NAME,
    route_type: 3,
    headsign: currentHeadsign(),
  }
}

export function getMockArrivalForStop(stopId: string): MockArrival | null {
  const stop = getMockStopById(stopId)
  if (!stop) return null

  const etaSec = estimateEtaSeconds(stopId)
  if (etaSec == null) return null

  const expected = hhmm(Date.now() + etaSec * 1000)

  return {
    id: MOCK_TRIP_ID,
    vehicle_id: MOCK_VEHICLE_ID,
    route_short_name: MOCK_ROUTE_SHORT_NAME,
    route_type: 3,
    headsign: currentHeadsign(),
    route_id: MOCK_ROUTE_ID,
    scheduled_time: expected,
    expected_time: expected,
    eta_minutes: Math.max(0, Math.round(etaSec / 60)),
    realtime: true,
    has_ramp: true,
  }
}

export function getMockTripDetail(): MockTripDetail {
  advanceToNow()

  const startIdx = state.dwellUntilMs > state.lastUpdateMs ? state.fromIdx : state.toIdx
  const now = Date.now()

  const stops = Array.from({ length: MOCK_STOPS.length }, (_, i) => {
    const stop = MOCK_STOPS[(startIdx + i) % MOCK_STOPS.length]
    const etaSec = estimateEtaSeconds(stop.id) ?? 0
    const expected = hhmm(now + etaSec * 1000)
    const etaMinutes = Math.max(0, Math.round(etaSec / 60))
    const status: TripStopStatus = etaMinutes === 0 ? 'on_time' : 'scheduled'

    return {
      stop_id: stop.id,
      stop_name: stop.name,
      stop_sequence: i + 1,
      scheduled_time: expected,
      expected_time: expected,
      eta_minutes: etaMinutes,
      status,
      delay_minutes: 0,
      realtime: true,
    }
  })

  return {
    vehicle_id: MOCK_VEHICLE_ID,
    trip_id: MOCK_TRIP_ID,
    route_id: MOCK_ROUTE_ID,
    route_short_name: MOCK_ROUTE_SHORT_NAME,
    route_type: 3,
    headsign: currentHeadsign(),
    stops,
  }
}

let timer: ReturnType<typeof setInterval> | null = null

function startMockTransitLoop() {
  if (timer) return
  timer = setInterval(() => {
    advanceToNow()
  }, 1000)
}

startMockTransitLoop()
