'use client'

import { useCallback, useEffect, useState } from 'react'
import { ROUTE_TYPE_CONFIG, ROUTE_TYPE_ORDER } from '@/lib/transit'

interface VehicleSummary {
  route_type: number | null
}

export default function AlertsPanel() {
  const [counts, setCounts] = useState<Record<number, number>>({})
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/realtime/vehicles')
      if (!res.ok) return
      const data: VehicleSummary[] = await res.json()
      const c: Record<number, number> = {}
      for (const v of data) {
        const t = typeof v.route_type === 'number' ? v.route_type : -1
        c[t] = (c[t] ?? 0) + 1
      }
      setCounts(c)
      setTotal(data.length)
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    load()
    const id = setInterval(load, 15_000)
    return () => clearInterval(id)
  }, [load])

  if (loading) {
    return <p className="side-panel-text py-3" style={{ color: 'var(--text-muted)' }}>Зареждане...</p>
  }

  return (
    <div className="space-y-3">
      <div
        className="rounded-xl p-4"
        style={{ background: 'var(--surface-elevated)', border: '1px solid var(--border)' }}
      >
        <p className="text-2xl font-bold" style={{ color: 'var(--text)' }}>{total}</p>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>активни превозни средства</p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {ROUTE_TYPE_ORDER.map((t) => {
          const meta = ROUTE_TYPE_CONFIG[t]
          if (!meta) return null
          return (
            <div
              key={t}
              className="rounded-xl p-3"
              style={{ background: 'var(--surface-elevated)', border: '1px solid var(--border)' }}
            >
              <div className="flex items-center gap-2">
                <span className="inline-block h-3 w-3 rounded-full" style={{ background: meta.color }} />
                <span className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>{meta.label}</span>
              </div>
              <p className="mt-1 text-xl font-bold" style={{ color: 'var(--text)' }}>{counts[t] ?? 0}</p>
            </div>
          )
        })}
        {(counts[-1] ?? 0) > 0 && (
          <div
            className="rounded-xl p-3"
            style={{ background: 'var(--surface-elevated)', border: '1px solid var(--border)' }}
          >
            <div className="flex items-center gap-2">
              <span className="inline-block h-3 w-3 rounded-full" style={{ background: '#888' }} />
              <span className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Други</span>
            </div>
            <p className="mt-1 text-xl font-bold" style={{ color: 'var(--text)' }}>{counts[-1]}</p>
          </div>
        )}
      </div>
    </div>
  )
}
