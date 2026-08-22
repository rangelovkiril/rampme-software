import { describe, expect, it } from 'bun:test'
import type { GtfsRealtimeTick } from '../../src/gtfs/realtime'
import { startPushLoop } from '../../src/gtfs/realtime'
import { Broadcaster } from '../../src/services/broadcaster'

describe('startPushLoop', () => {
  it('publishes on its own cadence unconditionally, with no dependency on upstream fetch success (b1023fc)', async () => {
    const broadcaster = new Broadcaster<GtfsRealtimeTick>()
    // Simulates every upstream feed being permanently down: startPushLoop
    // never calls this, but if it ever gained a fetch dependency, wiring
    // a health snapshot that always reports "stale" is the worst case.
    const getHealth = () => ({
      tripUpdates: { stale: true },
      vehiclePositions: { stale: true },
    })

    const received: number[] = []
    const iterator = broadcaster.subscribe()[Symbol.asyncIterator]()
    ;(async () => {
      for (let i = 0; i < 3; i++) {
        const { value } = await iterator.next()
        received.push(value.tick)
      }
    })()

    const stop = startPushLoop(broadcaster, getHealth, 10)
    await new Promise((resolve) => setTimeout(resolve, 60))
    stop()
    await iterator.return?.()

    expect(received.length).toBeGreaterThanOrEqual(3)
    expect(received).toEqual([1, 2, 3])
  })
})
