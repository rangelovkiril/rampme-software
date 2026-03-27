'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Stop } from '@/lib/types'

interface StopsPanelProps {
  onSelectStop?: (stop: Stop) => void
  onClose: () => void
}

export default function StopsPanel({ onSelectStop, onClose }: StopsPanelProps) {
  const [stops, setStops] = useState<Stop[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    let active = true
    async function load() {
      try {
        const res = await fetch('/api/stops')
        if (!res.ok || !active) return
        const data = await res.json()
        if (active && Array.isArray(data)) setStops(data)
      } catch { /* ignore */ }
      finally { if (active) setLoading(false) }
    }
    load()
    return () => { active = false }
  }, [])

  const filtered = useMemo(() => {
    if (!search.trim()) return stops.slice(0, 100)
    const q = search.trim().toLowerCase()
    return stops.filter(
      (s) =>
        s.stop_name.toLowerCase().includes(q) ||
        s.stop_id.toLowerCase().includes(q),
    ).slice(0, 100)
  }, [stops, search])

  const handleSelect = useCallback(
    (s: Stop) => {
      onSelectStop?.(s)
      onClose()
    },
    [onSelectStop, onClose],
  )

  if (loading) {
    return <p className="side-panel-text py-3" style={{ color: 'var(--text-muted)' }}>Зареждане...</p>
  }

  return (
    <div className="flex flex-col gap-3">
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Търси спирка..."
        className="side-panel-text w-full rounded-xl border px-3 py-2 outline-none"
        style={{
          background: 'var(--surface-elevated)',
          borderColor: 'var(--border)',
          color: 'var(--text)',
        }}
      />

      {search.trim() && (
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          {filtered.length} резултата
        </p>
      )}

      <div className="space-y-1.5">
        {filtered.length === 0 && (
          <p className="side-panel-text py-2" style={{ color: 'var(--text-muted)' }}>Няма намерени спирки.</p>
        )}
        {filtered.map((s) => (
          <button
            key={s.stop_id}
            type="button"
            onClick={() => handleSelect(s)}
            className="flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors"
            style={{
              background: 'var(--surface-elevated)',
              borderColor: 'var(--border)',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--control-hover)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--surface-elevated)')}
          >
            <span
              className="inline-flex h-7 w-7 items-center justify-center rounded-full"
              style={{ background: 'var(--control-bg)', color: 'var(--text-secondary)' }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium" style={{ color: 'var(--text)' }}>{s.stop_name}</p>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{s.stop_id}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
