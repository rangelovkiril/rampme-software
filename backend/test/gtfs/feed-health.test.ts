import { describe, expect, it } from 'bun:test'
import { FeedTracker } from '../../src/gtfs/feed-health'

describe('FeedTracker', () => {
  it('is stale before any successful fetch has been recorded', () => {
    const tracker = new FeedTracker(15_000)
    expect(tracker.stale).toBe(true)
  })

  it('is not stale immediately after a successful fetch', () => {
    const now = 1_000_000
    const tracker = new FeedTracker(15_000, () => now)
    tracker.recordSuccess()
    expect(tracker.stale).toBe(false)
  })

  it('becomes stale once the threshold elapses since the last success', () => {
    let now = 1_000_000
    const tracker = new FeedTracker(15_000, () => now)
    tracker.recordSuccess()

    now += 15_000
    expect(tracker.stale).toBe(false) // exactly at the threshold is not yet stale

    now += 1
    expect(tracker.stale).toBe(true)
  })

  it('recovers once fetches succeed again', () => {
    let now = 1_000_000
    const tracker = new FeedTracker(15_000, () => now)
    tracker.recordSuccess()
    now += 20_000
    expect(tracker.stale).toBe(true)

    tracker.recordSuccess()
    expect(tracker.stale).toBe(false)
  })

  it('tracks two feeds independently — one succeeding does not affect the other', () => {
    let now = 1_000_000
    const tripUpdates = new FeedTracker(15_000, () => now)
    const vehiclePositions = new FeedTracker(15_000, () => now)

    tripUpdates.recordSuccess()
    now += 20_000

    expect(tripUpdates.stale).toBe(true) // tripUpdates hasn't succeeded again
    expect(vehiclePositions.stale).toBe(true) // never succeeded at all

    vehiclePositions.recordSuccess()
    expect(vehiclePositions.stale).toBe(false)
    expect(tripUpdates.stale).toBe(true) // unaffected by vehiclePositions recovering
  })
})
