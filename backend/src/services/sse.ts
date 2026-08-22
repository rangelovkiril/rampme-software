import { realtimeEvents } from '../gtfs/realtime'

const HEARTBEAT_INTERVAL_MS = 20_000

export function makeSseStream(_request: Request, getData: () => Promise<unknown>) {
  const encoder = new TextEncoder()
  let send: (() => Promise<void>) | null = null
  let heartbeat: ReturnType<typeof setInterval> | null = null

  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(encoder.encode('retry: 3000\n\n'))

      send = async () => {
        let data: unknown
        try {
          data = await getData()
        } catch {
          return
        }
        if (data == null) return
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
        } catch {
          // stream closed — cancel will clean up
        }
      }

      await send()
      realtimeEvents.on('refresh', send)

      heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': hb\n\n'))
        } catch {
          // stream closed — cancel will clean up
        }
      }, HEARTBEAT_INTERVAL_MS)
    },

    cancel() {
      if (send) realtimeEvents.off('refresh', send)
      if (heartbeat) clearInterval(heartbeat)
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
