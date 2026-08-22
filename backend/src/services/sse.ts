import { sse } from 'elysia'

const HEARTBEAT_INTERVAL_MS = 20_000
const RETRY_MS = 3_000

/**
 * The transport helper only ever reads from a broadcaster (never publishes),
 * so it depends on this minimal, read-only shape rather than `Broadcaster<T>`
 * itself — `Broadcaster<T>.subscribe()` satisfies it for any `T`, since
 * async iterables are covariant in their yielded type.
 */
export interface Subscribable {
  subscribe(): AsyncIterable<unknown>
}

// A bare SSE comment (not a `data:` field) — invisible to EventSource's
// default 'message' handler and to any named-event listener. Exists purely
// to keep intermediary proxies (Cloudflare edge, the tunnel) from reaping an
// idle connection during a quiet period.
const HEARTBEAT = { toSSE: () => ': hb\n\n' }

export interface SseUpdate<T> {
  data: T
  /** Freshness of the underlying data, for streams that depend on one or
   *  more upstream feeds. Emits a `health` event on transition; omit
   *  entirely for streams with no freshness concept (e.g. ramp session). */
  healthy?: boolean
}

/**
 * Generic SSE transport. Sends the current data on connect, re-sends it on
 * every `broadcaster` publish, emits a `health` event on freshness
 * transitions (never on the initial connect, since there is no prior state
 * to transition from), and heartbeats during quiet periods. Knows nothing
 * about what `T` is or what "healthy" means — both are supplied by the
 * domain-specific caller via `getData`.
 */
export async function* makeSseStream<T>(
  broadcaster: Subscribable,
  getData: () => Promise<SseUpdate<T> | null>,
  heartbeatIntervalMs = HEARTBEAT_INTERVAL_MS,
) {
  let lastHealthy: boolean | undefined
  let healthInitialized = false

  async function* emit() {
    let update: SseUpdate<T> | null
    try {
      update = await getData()
    } catch {
      return
    }
    if (update == null) return

    if (update.healthy !== undefined) {
      if (healthInitialized && update.healthy !== lastHealthy) {
        yield sse({ event: 'health', data: { healthy: update.healthy } })
      }
      lastHealthy = update.healthy
      healthInitialized = true
    }

    yield sse({ data: update.data })
  }

  // Subscribe before computing the initial snapshot so a publish racing
  // with that first getData() call is never missed.
  const iterator = broadcaster.subscribe()[Symbol.asyncIterator]()
  let pending = iterator.next()
  let heartbeatTimer: ReturnType<typeof setTimeout> | null = null

  try {
    yield sse({ retry: RETRY_MS })
    yield* emit()

    while (true) {
      const heartbeat = new Promise<'heartbeat'>((resolve) => {
        heartbeatTimer = setTimeout(() => resolve('heartbeat'), heartbeatIntervalMs)
      })
      const outcome = await Promise.race([pending.then(() => 'data' as const), heartbeat])
      if (heartbeatTimer) {
        clearTimeout(heartbeatTimer)
        heartbeatTimer = null
      }

      if (outcome === 'heartbeat') {
        yield HEARTBEAT
        continue
      }

      const result = await pending
      if (result.done) return
      pending = iterator.next()
      yield* emit()
    }
  } finally {
    if (heartbeatTimer) clearTimeout(heartbeatTimer)
    await iterator.return?.()
  }
}
