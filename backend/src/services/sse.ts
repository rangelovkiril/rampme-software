import { realtimeEvents } from '../gtfs/realtime'

export function makeSseStream(_request: Request, getData: () => Promise<unknown>) {
  const encoder = new TextEncoder()
  let send: (() => Promise<void>) | null = null

  const stream = new ReadableStream({
    async start(controller) {
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
    },

    cancel() {
      if (send) realtimeEvents.off('refresh', send)
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
