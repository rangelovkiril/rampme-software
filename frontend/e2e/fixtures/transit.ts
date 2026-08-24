import type { Page, Route } from '@playwright/test'
import type { Stop, StopArrival, TripData, Vehicle } from '../../lib/types'

export const sessionId = 'e2e-session-id'

export function createStop(overrides: Partial<Stop> = {}): Stop {
  return {
    stop_id: 'STOP-E2E',
    stop_code: '1000',
    stop_name: 'Тестова спирка',
    stop_lat: 42.6977,
    stop_lon: 23.3219,
    wheelchair_boarding: 1,
    ...overrides,
  }
}

export function createVehicle(overrides: Partial<Vehicle> = {}): Vehicle {
  return {
    id: 'vehicle-e2e',
    tripId: 'trip-e2e',
    lat: 42.6978,
    lng: 23.322,
    bearing: 90,
    speed: 18,
    route_id: 'route-e2e',
    route_short_name: '84',
    route_type: 3,
    headsign: 'Орлов мост',
    label: 'E2E bus',
    ramp_status: 'working',
    ramp_reservations: [],
    ...overrides,
  }
}

export function createArrivals(overrides: Partial<StopArrival> = {}): StopArrival[] {
  const vehicle = createVehicle()
  return [
    {
      id: 'arrival-e2e',
      vehicle_id: vehicle.id,
      route_short_name: vehicle.route_short_name,
      route_type: vehicle.route_type,
      headsign: vehicle.headsign,
      route_id: vehicle.route_id,
      scheduled_time: '12:05',
      expected_time: '12:04',
      eta_minutes: 4,
      realtime: true,
      has_ramp: true,
      ...overrides,
    },
  ]
}

export function createTrip(overrides: Partial<TripData> = {}): TripData {
  const vehicle = createVehicle()
  const stop = createStop()
  return {
    vehicle_id: vehicle.id,
    route_id: vehicle.route_id,
    route_short_name: vehicle.route_short_name,
    route_type: vehicle.route_type,
    headsign: vehicle.headsign,
    stops: [
      {
        stop_id: stop.stop_id,
        stop_name: stop.stop_name,
        stop_sequence: 1,
        status: 'on_time',
        scheduled_time: '12:05',
        expected_time: '12:04',
        eta_minutes: 4,
        delay_minutes: -1,
        realtime: true,
      },
      {
        stop_id: 'STOP-NEXT',
        stop_name: 'Следваща спирка',
        stop_sequence: 2,
        status: 'scheduled',
        scheduled_time: '12:12',
        expected_time: '12:12',
        eta_minutes: 12,
        delay_minutes: 0,
        realtime: false,
      },
    ],
    ...overrides,
  }
}

interface Reservation {
  id: number
  session_id: string
  vehicle_id: string
  stop_id: string
  type: 'board' | 'alight'
  status: 'pending'
  created_at: number
  resolved_at: null
}

export interface ApiMockState {
  reservations: Reservation[]
  reserveRequests: Array<{
    sessionId: string | undefined
    vehicle_id: string
    stop_id: string
    type: 'board' | 'alight'
  }>
  cancelledIds: number[]
  rampSessionIds: Array<string | undefined>
  unhandledRequests: string[]
}

function fulfillJson(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  })
}

type Fulfiller = (route: Route, body: unknown) => Promise<void>

/**
 * A domain route handler matches a request by method + pathname (+ url for
 * query params) and returns whether it handled it. `mockTransitApi` tries
 * each domain in turn and falls through to `unhandledRequests` if none claim
 * the request - the same fallthrough the single `if`-chain used to do.
 */
type DomainRouteHandler = (
  route: Route,
  method: string,
  pathname: string,
  url: URL,
) => Promise<boolean>

// `/api/stops` and `/api/stops/:id/vehicles(/stream)` - mirrors backend/src/routes/stops.ts.
function createStopsRoutes(stop: Stop, arrivals: StopArrival[], fulfillSse: Fulfiller) {
  const handle: DomainRouteHandler = async (route, method, pathname) => {
    if (method === 'GET' && pathname === '/api/stops') {
      await fulfillJson(route, [stop])
      return true
    }
    if (method === 'GET' && pathname === `/api/stops/${stop.stop_id}/vehicles`) {
      await fulfillJson(route, arrivals)
      return true
    }
    if (method === 'GET' && pathname === `/api/stops/${stop.stop_id}/vehicles/stream`) {
      await fulfillSse(route, arrivals)
      return true
    }
    return false
  }
  return { handle }
}

// `/api/realtime/vehicles*` and `/api/routes/shapes` - named `transit`, not
// `realtime`, to match backend/src/services/transit/ (which backs the
// vehicle/trip/ETA handlers) and backend/src/routes/transit.ts (which owns
// `/routes/shapes`). Only this internal name changes; the `/api/realtime/*`
// route prefix the frontend calls is unaffected.
function createTransitRoutes(vehicle: Vehicle, trip: TripData, fulfillSse: Fulfiller) {
  const handle: DomainRouteHandler = async (route, method, pathname) => {
    if (method === 'GET' && pathname === '/api/realtime/vehicles') {
      await fulfillJson(route, [vehicle])
      return true
    }
    if (method === 'GET' && pathname === '/api/realtime/vehicles/stream') {
      await fulfillSse(route, [vehicle])
      return true
    }
    if (method === 'GET' && pathname === `/api/realtime/vehicles/${vehicle.id}/trip`) {
      await fulfillJson(route, trip)
      return true
    }
    if (method === 'GET' && pathname === `/api/realtime/vehicles/${vehicle.id}/trip/etas`) {
      await fulfillSse(route, trip.stops)
      return true
    }
    if (method === 'GET' && pathname === '/api/routes/shapes') {
      await fulfillJson(route, {})
      return true
    }
    return false
  }
  return { handle }
}

interface RampRouteState {
  reservations: Reservation[]
  reserveRequests: ApiMockState['reserveRequests']
  cancelledIds: number[]
  rampSessionIds: Array<string | undefined>
}

// `/api/ramp/session(/stream)` and `/api/ramp/reserve(/:id)` - mirrors
// backend/src/routes/ramp.ts, including the x-session-id/session_id
// validation guard that applies to every ramp path except the SSE stream
// (which takes it as a query param instead, since EventSource can't set
// custom headers).
function createRampRoutes(sessionId: string, fulfillSse: Fulfiller) {
  const state: RampRouteState = {
    reservations: [],
    reserveRequests: [],
    cancelledIds: [],
    rampSessionIds: [],
  }
  let nextReservationId = 1

  const handle: DomainRouteHandler = async (route, method, pathname, url) => {
    if (!pathname.startsWith('/api/ramp/')) return false
    const request = route.request()

    if (pathname !== '/api/ramp/session/stream') {
      const requestSessionId = request.headers()['x-session-id']
      state.rampSessionIds.push(requestSessionId)
      if (requestSessionId !== sessionId) {
        await fulfillJson(route, { error: 'Invalid E2E session' }, 400)
        return true
      }
    }

    if (method === 'GET' && pathname === '/api/ramp/session') {
      await fulfillJson(route, state.reservations)
      return true
    }
    if (method === 'GET' && pathname === '/api/ramp/session/stream') {
      const requestSessionId = url.searchParams.get('session_id') ?? undefined
      state.rampSessionIds.push(requestSessionId)
      if (requestSessionId !== sessionId) {
        await fulfillJson(route, { error: 'Invalid E2E session' }, 400)
        return true
      }
      await fulfillSse(route, state.reservations)
      return true
    }
    if (method === 'POST' && pathname === '/api/ramp/reserve') {
      const body = request.postDataJSON() as {
        vehicle_id: string
        stop_id: string
        type: 'board' | 'alight'
      }
      state.reserveRequests.push({
        sessionId: request.headers()['x-session-id'],
        ...body,
      })
      const reservation: Reservation = {
        id: nextReservationId++,
        session_id: sessionId,
        ...body,
        status: 'pending',
        created_at: 1_722_000_000,
        resolved_at: null,
      }
      state.reservations.push(reservation)
      await fulfillJson(route, reservation)
      return true
    }
    const cancelMatch = pathname.match(/^\/api\/ramp\/reserve\/(\d+)$/)
    if (method === 'DELETE' && cancelMatch) {
      const id = Number(cancelMatch[1])
      state.cancelledIds.push(id)
      const index = state.reservations.findIndex((reservation) => reservation.id === id)
      if (index !== -1) state.reservations.splice(index, 1)
      await fulfillJson(route, { ok: true })
      return true
    }

    return false
  }
  return { handle, state }
}

export async function mockTransitApi(page: Page): Promise<ApiMockState> {
  const stop = createStop()
  const vehicle = createVehicle()
  const arrivals = createArrivals()
  const trip = createTrip()
  const unhandledRequests: string[] = []

  // Real SSE endpoints stay open. `route.fulfill` always closes the
  // response, so a naive mock ends the stream after one message and the
  // browser's EventSource keeps reconnecting for the rest of the test. Send
  // the initial payload once per stream path, then leave later reconnect
  // attempts pending so they don't add noise.
  const streamedOnce = new Set<string>()

  const fulfillSse: Fulfiller = (route, body) => {
    const { pathname } = new URL(route.request().url())
    if (streamedOnce.has(pathname)) {
      return new Promise<void>(() => {})
    }
    streamedOnce.add(pathname)
    return route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      headers: { 'Cache-Control': 'no-cache' },
      body: `data: ${JSON.stringify(body)}\n\n`,
    })
  }

  const stopsRoutes = createStopsRoutes(stop, arrivals, fulfillSse)
  const transitRoutes = createTransitRoutes(vehicle, trip, fulfillSse)
  const rampRoutes = createRampRoutes(sessionId, fulfillSse)

  await page.addInitScript((id) => localStorage.setItem('rampme_session', id), sessionId)

  await page.route(/https:\/\/[^/]+\.basemaps\.cartocdn\.com\/.*/, (route) =>
    route.fulfill({ status: 204 }),
  )

  await page.route('**/api/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const { pathname } = url
    const method = request.method()

    if (await rampRoutes.handle(route, method, pathname, url)) return
    if (await stopsRoutes.handle(route, method, pathname, url)) return
    if (await transitRoutes.handle(route, method, pathname, url)) return

    unhandledRequests.push(`${method} ${pathname}`)
    await fulfillJson(route, { error: 'Unhandled E2E request' }, 404)
  })

  return {
    reservations: rampRoutes.state.reservations,
    reserveRequests: rampRoutes.state.reserveRequests,
    cancelledIds: rampRoutes.state.cancelledIds,
    rampSessionIds: rampRoutes.state.rampSessionIds,
    unhandledRequests,
  }
}
