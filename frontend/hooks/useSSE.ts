'use client'

import { useEffect, useState } from 'react'
import { apiPath } from '@/lib/config'

export function useSSE<T>(url: string | null): T | null {
  const [data, setData] = useState<T | null>(null)

  useEffect(() => {
    setData(null)
    if (!url) return
    const es = new EventSource(apiPath(url))
    es.onmessage = (e) => {
      try {
        setData(JSON.parse(e.data))
      } catch {}
    }
    return () => es.close()
  }, [url])

  return data
}
