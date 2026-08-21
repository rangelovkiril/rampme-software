import type { Page, Route } from '@playwright/test'

export const sessionId = 'e2e-session-id'

export const stop = {
  stop_id: 'STOP-E2E',
  stop_code: '1000',
  stop_name: 'Тестова спирка',
  stop_lat: 42.6977,
  stop_lon: 23.3219,
  wheelchair_boarding: 1,
}

export const vehicle = {
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
}

const arrivals = [
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
  },
]

const trip = {
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

export async function mockTransitApi(page: Page): Promise<ApiMockState> {
  const state: ApiMockState = {
    reservations: [],
    reserveRequests: [],
    cancelledIds: [],
    rampSessionIds: [],
    unhandledRequests: [],
  }
  let nextReservationId = 1
  // Real SSE endpoints stay open. `route.fulfill` always closes the
  // response, so a naive mock ends the stream after one message and the
  // browser's EventSource keeps reconnecting for the rest of the test. Send
  // the initial payload once per stream path, then leave later reconnect
  // attempts pending so they don't add noise.
  const streamedOnce = new Set<string>()

  function fulfillSse(route: Route, body: unknown) {
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

  await page.addInitScript((id) => localStorage.setItem('rampme_session', id), sessionId)

  await page.route(/https:\/\/[^/]+\.basemaps\.cartocdn\.com\/.*/, (route) =>
    route.fulfill({ status: 204 }),
  )

  await page.route('**/api/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const { pathname } = url
    const method = request.method()

    if (pathname.startsWith('/api/ramp/')) {
      const requestSessionId = request.headers()['x-session-id']
      state.rampSessionIds.push(requestSessionId)
      if (requestSessionId !== sessionId) {
        return fulfillJson(route, { error: 'Invalid E2E session' }, 400)
      }
    }

    if (method === 'GET' && pathname === '/api/stops') {
      return fulfillJson(route, [stop])
    }
    if (method === 'GET' && pathname === `/api/stops/${stop.stop_id}/vehicles`) {
      return fulfillJson(route, arrivals)
    }
    if (method === 'GET' && pathname === `/api/stops/${stop.stop_id}/vehicles/stream`) {
      return fulfillSse(route, arrivals)
    }
    if (method === 'GET' && pathname === '/api/realtime/vehicles') {
      return fulfillJson(route, [vehicle])
    }
    if (method === 'GET' && pathname === '/api/realtime/vehicles/stream') {
      return fulfillSse(route, [vehicle])
    }
    if (method === 'GET' && pathname === `/api/realtime/vehicles/${vehicle.id}/trip`) {
      return fulfillJson(route, trip)
    }
    if (method === 'GET' && pathname === `/api/realtime/vehicles/${vehicle.id}/trip/etas`) {
      return fulfillSse(route, trip.stops)
    }
    if (method === 'GET' && pathname === '/api/routes/shapes') {
      return fulfillJson(route, {})
    }
    if (method === 'GET' && pathname === '/api/ramp/session') {
      return fulfillJson(route, state.reservations)
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
      state.reservations = [...state.reservations, reservation]
      return fulfillJson(route, reservation)
    }
    const cancelMatch = pathname.match(/^\/api\/ramp\/reserve\/(\d+)$/)
    if (method === 'DELETE' && cancelMatch) {
      const id = Number(cancelMatch[1])
      state.cancelledIds.push(id)
      state.reservations = state.reservations.filter((reservation) => reservation.id !== id)
      return fulfillJson(route, { ok: true })
    }

    state.unhandledRequests.push(`${method} ${pathname}`)
    return fulfillJson(route, { error: 'Unhandled E2E request' }, 404)
  })

  return state
}
