import { describe, expect, test } from 'bun:test'
import { createRampDb } from '../../../src/db/ramp'
import type { GtfsData, GtfsRtFeedMessage } from '../../../src/gtfs/types'
import type { RampBridge } from '../../../src/services/ramp/bridge'
import { createProximityChecker } from '../../../src/services/ramp/proximity'

/** A minimal GtfsData with only the `stops` lookup proximity.ts actually reads. */
function gtfsData(stops: Array<{ id: string; lat: number; lon: number }>): GtfsData {
  return {
    stops: new Map(
      stops.map((s) => [
        s.id,
        {
          stop_id: s.id,
          stop_code: s.id,
          stop_name: s.id,
          stop_lat: s.lat,
          stop_lon: s.lon,
          wheelchair_boarding: 0,
        },
      ]),
    ),
    stopsByCode: new Map(),
    routes: new Map(),
    trips: new Map(),
    tripsByRoute: new Map(),
    stopTimes: [],
    stopTimesByStop: new Map(),
    stopTimesByTrip: new Map(),
    stopIdsByRoute: new Map(),
    calendarDates: [],
    shapes: new Map(),
    shapesByRoute: new Map(),
  }
}

/** A fake RampBridge that records publishDeploy calls and tracks trigger state like the real bridge. */
function fakeBridge() {
  const publishDeployCalls: string[] = []
  const deployedFor = new Map<string, string>() // vehicleId -> stopId

  const bridge: RampBridge = {
    publishNewReservation: () => {},
    publishCancelReservation: () => {},
    publishDeploy(vehicleId) {
      publishDeployCalls.push(vehicleId)
    },
    markDeployTriggered(vehicleId, stopId) {
      deployedFor.set(vehicleId, stopId)
    },
    wasDeployTriggered(vehicleId, stopId) {
      return deployedFor.get(vehicleId) === stopId
    },
    isDeployInFlight(vehicleId) {
      return deployedFor.has(vehicleId)
    },
    clearDeployTrigger(vehicleId) {
      deployedFor.delete(vehicleId)
    },
    subscribeToHardwareStates: () => {},
    resyncAllReservations: () => {},
  }

  return { bridge, publishDeployCalls }
}

/** Stubs fetchVehiclePositions() with a canned set of vehicle GPS positions. */
function positions(
  entries: Array<{ vehicleId: string; lat: number; lng: number }>,
): () => Promise<GtfsRtFeedMessage> {
  return async () => ({
    entity: entries.map((e) => ({
      id: e.vehicleId,
      vehicle: { vehicle: { id: e.vehicleId }, position: { latitude: e.lat, longitude: e.lng } },
    })),
  })
}

describe('createProximityChecker', () => {
  test('triggers publishDeploy exactly once for a reservation within RADIUS_M — not re-triggered while already in flight', async () => {
    const rampDb = createRampDb(':memory:')
    rampDb.createReservation('sess-1', 'bus1', 'stopA', 'board')
    const data = gtfsData([{ id: 'stopA', lat: 0, lon: 0 }])
    const { bridge, publishDeployCalls } = fakeBridge()
    const fetchPositions = positions([{ vehicleId: 'bus1', lat: 0, lng: 0 }]) // right at the stop

    const checker = createProximityChecker(
      () => bridge,
      () => data,
      rampDb,
      fetchPositions,
    )

    await checker.tick()
    await checker.tick()

    expect(publishDeployCalls).toEqual(['bus1'])
  })

  test('expires a reservation whose vehicle has been absent past vehicleGoneSeconds', async () => {
    const rampDb = createRampDb(':memory:')
    rampDb.createReservation('sess-1', 'bus1', 'stopA', 'board')
    const data = gtfsData([{ id: 'stopA', lat: 0, lon: 0 }])
    const { bridge } = fakeBridge()
    const fetchPositions = positions([]) // vehicle never reports a position

    const checker = createProximityChecker(
      () => bridge,
      () => data,
      rampDb,
      fetchPositions,
      {
        vehicleGoneSeconds: -1, // any elapsed time counts as "gone", no real waiting needed
      },
    )

    await checker.tick()

    const [reservation] = rampDb.getSessionReservations('sess-1')
    expect(reservation?.status).toBe('expired')
  })

  test('expires a reservation older than expirySeconds regardless of vehicle position', async () => {
    const rampDb = createRampDb(':memory:')
    rampDb.createReservation('sess-1', 'bus1', 'stopA', 'board')
    const data = gtfsData([{ id: 'stopA', lat: 0, lon: 0 }])
    const { bridge, publishDeployCalls } = fakeBridge()
    const fetchPositions = positions([{ vehicleId: 'bus1', lat: 0, lng: 0 }]) // at the stop

    const checker = createProximityChecker(
      () => bridge,
      () => data,
      rampDb,
      fetchPositions,
      {
        expirySeconds: -1, // any age counts as expired, no real waiting needed
      },
    )

    await checker.tick()

    const [reservation] = rampDb.getSessionReservations('sess-1')
    expect(reservation?.status).toBe('expired')
    // Age expiry is checked before proximity — being at the stop doesn't save it.
    expect(publishDeployCalls).toEqual([])
  })

  test('clears the deploy-trigger flag once the vehicle moves more than RADIUS_M * 2 away', async () => {
    const rampDb = createRampDb(':memory:')
    rampDb.createReservation('sess-1', 'bus1', 'stopA', 'board')
    const data = gtfsData([{ id: 'stopA', lat: 0, lon: 0 }])
    const { bridge } = fakeBridge()
    bridge.markDeployTriggered('bus1', 'stopA')
    expect(bridge.isDeployInFlight('bus1')).toBe(true)

    const fetchPositions = positions([{ vehicleId: 'bus1', lat: 1, lng: 1 }]) // ~150km away
    const checker = createProximityChecker(
      () => bridge,
      () => data,
      rampDb,
      fetchPositions,
    )

    await checker.tick()

    expect(bridge.isDeployInFlight('bus1')).toBe(false)
  })
})
