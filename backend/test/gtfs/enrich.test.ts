import { describe, expect, test } from 'bun:test'
import { enrichVehicles } from '../../src/gtfs/enrich'
import type { GtfsData, GtfsRtFeedEntity, Route, Trip } from '../../src/gtfs/types'

function emptyGtfsData(overrides: Partial<GtfsData> = {}): GtfsData {
  return {
    stops: new Map(),
    stopsByCode: new Map(),
    routes: new Map(),
    trips: new Map(),
    tripsByRoute: new Map(),
    stopTimesByStop: new Map(),
    stopTimesByTrip: new Map(),
    stopIdsByRoute: new Map(),
    calendarDates: [],
    shapesByRoute: new Map(),
    ...overrides,
  }
}

function positionEntity(vehicleId: string, tripId = 'trip-1'): GtfsRtFeedEntity {
  return {
    id: vehicleId,
    vehicle: {
      trip: { tripId, routeId: 'route-1' },
      vehicle: { id: vehicleId },
      position: { latitude: 42.7, longitude: 23.3 },
    },
  }
}

const trip: Trip = {
  trip_id: 'trip-1',
  route_id: 'route-1',
  service_id: 'svc',
  trip_headsign: 'Center',
  shape_id: 'shape-1',
  wheelchair_accessible: 0,
}

const route: Route = {
  route_id: 'route-1',
  route_short_name: '94',
  route_long_name: 'Line 94',
  route_type: 3,
}

describe('enrichVehicles', () => {
  test('a vehicle resolveAccessibility confirms equipped reports working', () => {
    const data = emptyGtfsData({
      trips: new Map([['trip-1', trip]]),
      routes: new Map([['route-1', route]]),
    })
    const [vehicle] = enrichVehicles([positionEntity('A2053')], data, new Map(), () => true)
    expect(vehicle?.ramp_status).toBe('working')
  })

  test('a vehicle resolveAccessibility confirms not equipped reports no_ramp', () => {
    const data = emptyGtfsData({
      trips: new Map([['trip-1', trip]]),
      routes: new Map([['route-1', route]]),
    })
    const [vehicle] = enrichVehicles([positionEntity('A9999')], data, new Map(), () => false)
    expect(vehicle?.ramp_status).toBe('no_ramp')
  })

  test('an unresolved vehicle reports unknown, not a guess', () => {
    const data = emptyGtfsData({
      trips: new Map([['trip-1', trip]]),
      routes: new Map([['route-1', route]]),
    })
    const [vehicle] = enrichVehicles([positionEntity('A0000')], data, new Map(), () => null)
    expect(vehicle?.ramp_status).toBe('unknown')
  })

  test('resolveAccessibility is called with the live vehicle id, not the trip id', () => {
    const data = emptyGtfsData({
      trips: new Map([['trip-1', trip]]),
      routes: new Map([['route-1', route]]),
    })
    const seen: string[] = []
    enrichVehicles([positionEntity('A2053')], data, new Map(), (id) => {
      seen.push(id)
      return null
    })
    expect(seen).toEqual(['A2053'])
  })
})
