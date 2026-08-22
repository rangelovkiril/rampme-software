import { describe, expect, it } from 'bun:test'
import { Broadcaster } from '../../src/services/broadcaster'

describe('Broadcaster', () => {
  it('does not throw when publishing before any subscriber exists', () => {
    const b = new Broadcaster<number>()
    expect(() => b.publish(1)).not.toThrow()
  })

  it('does not replay values published before a subscriber attaches', async () => {
    const b = new Broadcaster<number>()
    b.publish(1)

    const iterator = b.subscribe()[Symbol.asyncIterator]()
    const pending = iterator.next()
    b.publish(2)

    expect((await pending).value).toBe(2)
    await iterator.return?.()
  })

  it('delivers values published after subscribing', async () => {
    const b = new Broadcaster<number>()
    const iterator = b.subscribe()[Symbol.asyncIterator]()

    const pending = iterator.next()
    b.publish(42)

    expect(await pending).toEqual({ value: 42, done: false })
    await iterator.return?.()
  })

  it('fans out one publish to multiple independent subscribers', async () => {
    const b = new Broadcaster<string>()
    const a = b.subscribe()[Symbol.asyncIterator]()
    const c = b.subscribe()[Symbol.asyncIterator]()

    const pendingA = a.next()
    const pendingC = c.next()
    b.publish('hello')

    expect((await pendingA).value).toBe('hello')
    expect((await pendingC).value).toBe('hello')
    await a.return?.()
    await c.return?.()
  })

  it('queues multiple publishes and delivers them in order across next() calls', async () => {
    const b = new Broadcaster<number>()
    const iterator = b.subscribe()[Symbol.asyncIterator]()

    b.publish(1)
    b.publish(2)

    expect((await iterator.next()).value).toBe(1)
    expect((await iterator.next()).value).toBe(2)
    await iterator.return?.()
  })

  it('releases the subscription on return() so it stops receiving', async () => {
    const b = new Broadcaster<number>()
    const iterator = b.subscribe()[Symbol.asyncIterator]()
    expect(b.subscriberCount).toBe(1)

    await iterator.return?.()
    expect(b.subscriberCount).toBe(0)

    // A publish after release must not resurrect the listener or throw.
    expect(() => b.publish(99)).not.toThrow()
  })
})
