'use client'

import type { RouteResponse as Route } from '@backend/schemas'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api } from '@/lib/api'
import { ROUTE_TYPE_CONFIG, ROUTE_TYPE_ORDER } from '@/lib/transit'
import FilterChip from './FilterChip'

interface RoutesPanelProps {
  onSelectRoute?: (routeId: string, routeType: number) => void
  onClose: () => void
}

const TYPE_ORDER_INDICES = new Map<number, number>(ROUTE_TYPE_ORDER.map((t, i) => [t, i]))

export default function RoutesPanel({ onSelectRoute, onClose }: RoutesPanelProps) {
  const [routes, setRoutes] = useState<Route[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState<number | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let active = true
    async function load() {
      try {
        const { data } = await api.routes.get()
        if (active && data) {
          setRoutes(data)
          setError(false)
        } else if (active) {
          setError(true)
        }
      } catch {
        if (active) setError(true)
      } finally {
        if (active) setLoading(false)
      }
    }
    load()
    return () => {
      active = false
    }
  }, [])

  const filtered = useMemo(() => {
    let list = routes
    if (filterType !== null) list = list.filter((r) => r.type === filterType)
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(
        (r) => r.shortName.toLowerCase().includes(q) || r.longName.toLowerCase().includes(q),
      )
    }
    return list.sort((a, b) => {
      const ta = TYPE_ORDER_INDICES.get(a.type) ?? 999
      const tb = TYPE_ORDER_INDICES.get(b.type) ?? 999
      if (ta !== tb) return ta - tb
      const na = parseInt(a.shortName, 10)
      const nb = parseInt(b.shortName, 10)
      if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb
      return a.shortName.localeCompare(b.shortName)
    })
  }, [routes, search, filterType])

  const handleSelect = useCallback(
    (r: Route) => {
      onSelectRoute?.(r.id, r.type)
      onClose()
    },
    [onSelectRoute, onClose],
  )

  if (loading) {
    return (
      <p className="side-panel-text py-3" style={{ color: 'var(--text-muted)' }}>
        Зареждане...
      </p>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col gap-3 py-3">
        <p className="side-panel-text" style={{ color: 'var(--text-secondary)' }}>
          Неуспешно зареждане на линиите.
        </p>
        <button
          type="button"
          onClick={() => {
            setLoading(true)
            setError(false)
            void api.routes
              .get()
              .then(({ data }) => {
                if (data) setRoutes(data)
                else setError(true)
              })
              .catch(() => setError(true))
              .finally(() => setLoading(false))
          }}
          className="rounded-xl px-3 py-2 text-sm font-semibold"
          style={{ background: 'var(--control-bg)', color: 'var(--text)' }}
        >
          Опитайте отново
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <input
        ref={inputRef}
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Търси линия..."
        className="side-panel-text w-full rounded-xl border px-3 py-2 outline-none"
        style={{
          background: 'var(--surface-elevated)',
          borderColor: 'var(--border)',
          color: 'var(--text)',
        }}
      />

      <div className="flex flex-wrap gap-1.5">
        <FilterChip
          active={filterType === null}
          onClick={() => setFilterType(null)}
          label="Всички"
          color="var(--text-secondary)"
        />
        {ROUTE_TYPE_ORDER.map((t) => {
          const meta = ROUTE_TYPE_CONFIG[t]
          if (!meta) return null
          return (
            <FilterChip
              key={t}
              active={filterType === t}
              onClick={() => setFilterType((prev) => (prev === t ? null : t))}
              label={meta.label}
              color={meta.color}
            />
          )
        })}
      </div>

      <div className="space-y-1.5">
        {filtered.length === 0 && (
          <p className="side-panel-text py-2" style={{ color: 'var(--text-muted)' }}>
            Няма намерени линии.
          </p>
        )}
        {filtered.map((r) => {
          const meta = ROUTE_TYPE_CONFIG[r.type]
          return (
            <button
              key={r.id}
              type="button"
              onClick={() => handleSelect(r)}
              className="flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors"
              style={{
                background: 'var(--surface-elevated)',
                borderColor: 'var(--border)',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--control-hover)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--surface-elevated)')}
            >
              <span
                className="inline-flex h-7 min-w-[3rem] items-center justify-center rounded-md px-2 text-sm font-bold text-white"
                style={{ background: meta?.color ?? '#BE1E2D' }}
              >
                {r.shortName}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium" style={{ color: 'var(--text)' }}>
                  {r.longName || r.shortName}
                </p>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  {meta?.label ?? 'Друго'}
                </p>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
