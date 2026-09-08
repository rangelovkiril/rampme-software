import type {
  StopResponse as Stop,
  ArrivalResult as StopArrival,
  TripDetailResult as TripData,
  EnrichedVehicle as Vehicle,
} from '@backend/schemas'
import type { Page, Route } from '@playwright/test'

export const sessionId = 'e2e-session-id'

export function createStop(overrides: Partial<Stop> = {}): Stop {
  return {
    id: 'STOP-E2E',
    code: '1000',
    name: 'Тестова спирка',
    lat: 42.6977,
    lon: 23.3219,
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
    routeId: 'route-e2e',
    routeShortName: '84',
    routeType: 3,
    headsign: 'Орлов мост',
    label: 'E2E bus',
    rampStatus: 'working',
    ...overrides,
  }
}

export function createArrivals(overrides: Partial<StopArrival> = {}): StopArrival[] {
  const vehicle = createVehicle()
  return [
    {
      id: 'arrival-e2e',
      vehicleId: vehicle.id,
      routeShortName: vehicle.routeShortName,
      routeType: vehicle.routeType,
      headsign: vehicle.headsign,
      routeId: vehicle.routeId,
      scheduledTime: '12:05',
      expectedTime: '12:04',
      etaMinutes: 4,
      realtime: true,
      hasRamp: true,
      ...overrides,
    },
  ]
}

export function createTrip(overrides: Partial<TripData> = {}): TripData {
  const vehicle = createVehicle()
  const stop = createStop()
  return {
    vehicleId: vehicle.id,
    tripId: vehicle.tripId,
    routeId: vehicle.routeId ?? '',
    routeShortName: vehicle.routeShortName,
    routeType: vehicle.routeType,
    headsign: vehicle.headsign,
    stops: [
      {
        stopId: stop.id,
        stopName: stop.name,
        stopSequence: 1,
        status: 'on_time',
        scheduledTime: '12:05',
        expectedTime: '12:04',
        etaMinutes: 4,
        delayMinutes: -1,
        realtime: true,
      },
      {
        stopId: 'STOP-NEXT',
        stopName: 'Следваща спирка',
        stopSequence: 2,
        status: 'scheduled',
        scheduledTime: '12:12',
        expectedTime: '12:12',
        etaMinutes: 12,
        delayMinutes: 0,
        realtime: false,
      },
    ],
    ...overrides,
  }
}

interface Reservation {
  id: number
  vehicleId: string
  stopId: string
  type: 'board' | 'alight'
  status: 'pending'
  createdAt: number
  resolvedAt: null
}

export interface ApiMockState {
  reservations: Reservation[]
  reserveRequests: Array<{
    sessionId: string | undefined
    vehicleId: string
    stopId: string
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
    if (method === 'GET' && pathname === `/api/stops/${stop.id}/vehicles`) {
      await fulfillJson(route, arrivals)
      return true
    }
    if (method === 'GET' && pathname === `/api/stops/${stop.id}/vehicles/stream`) {
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
function createTransitRoutes(
  vehicle: Vehicle,
  vehicles: Vehicle[],
  trip: TripData,
  fulfillSse: Fulfiller,
) {
  const handle: DomainRouteHandler = async (route, method, pathname) => {
    if (method === 'GET' && pathname === '/api/realtime/vehicles') {
      await fulfillJson(route, vehicles)
      return true
    }
    if (method === 'GET' && pathname === '/api/realtime/vehicles/stream') {
      await fulfillSse(route, vehicles)
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
// backend/src/routes/ramp.ts, including the session-id guard that applies to
// every ramp path except the SSE stream (which takes it as a `sessionId` query
// param instead, since EventSource can't set custom headers).
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
      const requestSessionId = url.searchParams.get('sessionId') ?? undefined
      state.rampSessionIds.push(requestSessionId)
      if (requestSessionId !== sessionId) {
        await fulfillJson(route, { error: 'Invalid E2E session' }, 400)
        return true
      }
      await fulfillSse(route, state.reservations)
      return true
    }
    if (method === 'POST' && pathname === '/api/ramp/reserve') {
      // The real shape comes from the backend's ReserveBody model; this mock is
      // the one copy tsc cannot check, so keep it in step with that model.
      const body = request.postDataJSON() as {
        vehicleId: string
        stopId: string
        type: 'board' | 'alight'
      }
      state.reserveRequests.push({
        sessionId: request.headers()['x-session-id'],
        ...body,
      })
      const reservation: Reservation = {
        id: nextReservationId++,
        ...body,
        status: 'pending',
        createdAt: 1_722_000_000,
        resolvedAt: null,
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

export async function mockTransitApi(
  page: Page,
  options: { vehicles?: Vehicle[] } = {},
): Promise<ApiMockState> {
  const stop = createStop()
  const vehicle = createVehicle()
  // The primary `vehicle` still backs the single-vehicle trip/etas routes
  // below; `vehicles` only widens what the list-returning routes serve, so
  // every existing single-vehicle test is unaffected by this default.
  const vehicles = options.vehicles ?? [vehicle]
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
  const transitRoutes = createTransitRoutes(vehicle, vehicles, trip, fulfillSse)
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
