'use client'

import { useEffect, useState } from 'react'

function resolveSseUrl(url: string): string {
  if (/^https?:\/\//i.test(url)) return url

  const configuredBase = process.env.NEXT_PUBLIC_BACKEND_URL?.trim()
  if (configuredBase) {
    const base = configuredBase.replace(/\/$/, '')
    const suffix = url.startsWith('/') ? url : `/${url}`
    return `${base}${suffix}`
  }

  if (url.startsWith('/api/')) return url
  if (url.startsWith('/')) return `/api${url}`
  return `/api/${url}`
}

export function useSSE<T>(url: string | null): T | null {
  const [data, setData] = useState<T | null>(null)

  useEffect(() => {
    setData(null)
    if (!url) return
    const es = new EventSource(resolveSseUrl(url))
    es.onmessage = (e) => {
      try {
        setData(JSON.parse(e.data))
      } catch {}
    }
    return () => es.close()
  }, [url])

  return data
}
