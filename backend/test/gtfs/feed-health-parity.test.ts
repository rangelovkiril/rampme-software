import { describe, expect, it } from 'bun:test'
import { FeedTracker } from '../../src/gtfs/feed-health'
import { computeFeedHealth } from '../../src/gtfs/realtime'

// `GET /realtime/vehicles`'s `meta.stale` and every GTFS-derived SSE stream's
// `healthy` flag are both built from `getFeedHealth()`, which is this
// function applied to the module's two real trackers — so they can never
// disagree at a given instant. This exercises that aggregation directly,
// without depending on real network timing or module import order (see
// `realtime.test.ts` for why: the module's own background fetch loop starts
// on import, so its singleton trackers can't be forced into a known state
// from a test).
describe('computeFeedHealth', () => {
  it('reports both feeds stale when neither has ever succeeded', () => {
    const tripUpdates = new FeedTracker(15_000)
    const vehiclePositions = new FeedTracker(15_000)

    const health = computeFeedHealth(tripUpdates, vehiclePositions)

    expect(health).toEqual({
      tripUpdates: { stale: true },
      vehiclePositions: { stale: true },
    })
  })

  it('reflects each feed independently — the shape every consumer, streaming or not, reads staleness from', () => {
    let now = 1_000_000
    const tripUpdates = new FeedTracker(15_000, () => now)
    const vehiclePositions = new FeedTracker(15_000, () => now)

    tripUpdates.recordSuccess()
    now += 20_000 // only tripUpdates has succeeded, and it's now past threshold too

    expect(computeFeedHealth(tripUpdates, vehiclePositions)).toEqual({
      tripUpdates: { stale: true },
      vehiclePositions: { stale: true },
    })

    vehiclePositions.recordSuccess()

    expect(computeFeedHealth(tripUpdates, vehiclePositions)).toEqual({
      tripUpdates: { stale: true },
      vehiclePositions: { stale: false },
    })
  })
})
