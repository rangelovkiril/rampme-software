'use client'

import { useEffect, useState } from 'react'
import { apiPath } from '@/lib/config'

const BACKOFF_START_MS = 2_000
const BACKOFF_MAX_MS = 30_000

export function useSSE<T>(url: string | null): T | null {
  const [data, setData] = useState<T | null>(null)

  useEffect(() => {
    setData(null)
    if (!url) return

    let es: EventSource | null = null
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null
    let backoff = BACKOFF_START_MS
    let stopped = false

    const connect = () => {
      es = new EventSource(apiPath(url))
      es.onmessage = (e) => {
        backoff = BACKOFF_START_MS
        try {
          setData(JSON.parse(e.data))
        } catch {}
      }
      es.onerror = () => {
        if (es?.readyState !== EventSource.CLOSED) return
        es.close()
        if (stopped) return
        reconnectTimer = setTimeout(connect, backoff)
        backoff = Math.min(backoff * 2, BACKOFF_MAX_MS)
      }
    }

    connect()

    return () => {
      stopped = true
      if (reconnectTimer) clearTimeout(reconnectTimer)
      es?.close()
    }
  }, [url])

  return data
}
