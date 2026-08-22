import { describe, expect, it } from 'bun:test'
import { Broadcaster } from '../../src/services/broadcaster'
import { makeSseStream } from '../../src/services/sse'

// Elysia's sse() attaches a runtime .toSSE() method to format the wire line,
// but its TS type doesn't expose it — this reads the actual bytes that would
// be sent to the client.
function wire(value: unknown): string {
  return (value as { toSSE: () => string }).toSSE()
}

describe('makeSseStream', () => {
  it('sends the retry hint then the current data on connect', async () => {
    const broadcaster = new Broadcaster<unknown>()
    const gen = makeSseStream(broadcaster, async () => ({ data: { hello: 'world' } }))

    const first = await gen.next()
    expect(wire(first.value)).toBe('retry: 3000\n\n')

    const second = await gen.next()
    expect(wire(second.value)).toBe('data: {"hello":"world"}\n\n')

    await gen.return(undefined)
  })

  it('skips sending anything when getData resolves null, but stays connected', async () => {
    const broadcaster = new Broadcaster<unknown>()
    const gen = makeSseStream(broadcaster, async () => null, 20)

    await gen.next() // retry hint
    const afterInitial = await gen.next() // heartbeat fires since no data was queued
    expect(wire(afterInitial.value)).toBe(': hb\n\n')

    await gen.return(undefined)
  })

  it('emits a heartbeat when no publish happens within the interval', async () => {
    const broadcaster = new Broadcaster<unknown>()
    const gen = makeSseStream(broadcaster, async () => ({ data: { n: 1 } }), 20)

    await gen.next() // retry
    await gen.next() // initial data
    const heartbeat = await gen.next()
    expect(wire(heartbeat.value)).toBe(': hb\n\n')

    await gen.return(undefined)
  })

  it('pushes updated data on every broadcaster publish', async () => {
    const broadcaster = new Broadcaster<unknown>()
    let counter = 0
    const gen = makeSseStream(broadcaster, async () => ({ data: { n: ++counter } }), 10_000)

    await gen.next() // retry
    const initial = await gen.next()
    expect(wire(initial.value)).toBe('data: {"n":1}\n\n')

    const pendingUpdate = gen.next()
    broadcaster.publish('tick')
    const update = await pendingUpdate
    expect(wire(update.value)).toBe('data: {"n":2}\n\n')

    await gen.return(undefined)
  })

  it('never emits a health event on the initial connect, even if already degraded', async () => {
    const broadcaster = new Broadcaster<unknown>()
    const gen = makeSseStream(broadcaster, async () => ({ data: { n: 1 }, healthy: false }), 10_000)

    await gen.next() // retry
    const initial = await gen.next()
    expect(wire(initial.value)).toBe('data: {"n":1}\n\n')

    await gen.return(undefined)
  })

  it('emits a health event only when the degraded state changes, not on every publish', async () => {
    const broadcaster = new Broadcaster<unknown>()
    let healthy = true
    const gen = makeSseStream(broadcaster, async () => ({ data: { n: 1 }, healthy }), 10_000)

    await gen.next() // retry
    await gen.next() // initial data, primes health silently

    // Unchanged health -> no health event, straight to data.
    let pending = gen.next()
    broadcaster.publish('tick')
    let next = await pending
    expect(wire(next.value)).toBe('data: {"n":1}\n\n')

    // Transition to degraded -> health event first, then data.
    healthy = false
    pending = gen.next()
    broadcaster.publish('tick')
    next = await pending
    expect(wire(next.value)).toBe('event: health\ndata: {"healthy":false}\n\n')

    const dataAfterHealth = await gen.next()
    expect(wire(dataAfterHealth.value)).toBe('data: {"n":1}\n\n')

    await gen.return(undefined)
  })

  it('releases the broadcaster subscription on disconnect (generator return)', async () => {
    const broadcaster = new Broadcaster<unknown>()
    const gen = makeSseStream(broadcaster, async () => ({ data: { n: 1 } }), 10_000)

    await gen.next() // retry
    await gen.next() // initial data
    expect(broadcaster.subscriberCount).toBe(1)

    await gen.return(undefined)
    expect(broadcaster.subscriberCount).toBe(0)

    // Further iteration after disconnect must not produce more values.
    const after = await gen.next()
    expect(after.done).toBe(true)
  })

  it('does not leave a dangling heartbeat timer running after disconnect', async () => {
    const broadcaster = new Broadcaster<unknown>()
    const gen = makeSseStream(broadcaster, async () => ({ data: { n: 1 } }), 15)

    await gen.next() // retry
    await gen.next() // initial data
    await gen.return(undefined)

    // If the heartbeat timer were still armed, waiting past its interval
    // and then resuming would either throw or reveal a new heartbeat value.
    // Instead the generator is already finished.
    await new Promise((resolve) => setTimeout(resolve, 40))
    const after = await gen.next()
    expect(after.done).toBe(true)
  })
})
