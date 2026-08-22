/**
 * Domain-agnostic publish/subscribe primitive. Each `subscribe()` call
 * returns its own async iterable fed only by values published *after* the
 * call — there is no replay of values published before a subscriber attaches.
 */
export class Broadcaster<T> {
  private readonly listeners = new Set<(value: T) => void>()

  publish(value: T): void {
    for (const listener of this.listeners) listener(value)
  }

  subscribe(): AsyncIterable<T> {
    const queue: T[] = []
    let wake: (() => void) | null = null

    const listener = (value: T) => {
      queue.push(value)
      wake?.()
      wake = null
    }
    this.listeners.add(listener)

    const listeners = this.listeners
    return {
      [Symbol.asyncIterator](): AsyncIterator<T> {
        return {
          async next(): Promise<IteratorResult<T>> {
            while (queue.length === 0) {
              await new Promise<void>((resolve) => {
                wake = resolve
              })
            }
            return { value: queue.shift() as T, done: false }
          },
          async return(): Promise<IteratorResult<T, undefined>> {
            listeners.delete(listener)
            return { value: undefined, done: true }
          },
        }
      },
    }
  }

  /** Exposed for tests to verify a subscription is released on cleanup. */
  get subscriberCount(): number {
    return this.listeners.size
  }
}
