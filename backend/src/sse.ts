import { realtimeEvents } from './gtfs/realtime'

/**
 * Creates an SSE Response that sends data immediately on connect, then again
 * after every realtime feed refresh (~5s). Cleans up listeners on disconnect.
 */
export function makeSseStream(request: Request, getData: () => Promise<unknown>) {
  const encoder = new TextEncoder()
  let closed = false

  const stream = new ReadableStream({
    async start(controller) {
      const send = async () => {
        if (closed) return
        try {
          const data = await getData()
          if (data == null || closed) return
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
        } catch {}
      }

      await send()
      realtimeEvents.on('refresh', send)

      request.signal.addEventListener('abort', () => {
        closed = true
        realtimeEvents.off('refresh', send)
        try { controller.close() } catch {}
      })
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}
