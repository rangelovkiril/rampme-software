'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

/* ---------- shared types -------------------------------------------------- */

interface Stop {
  stop_id: string
  stop_name: string
  stop_lat: number
  stop_lon: number
}

interface Route {
  route_id: string
  route_short_name: string
  route_long_name: string
  route_type: number
}

interface VehicleSummary {
  route_type: number | null
}

/* ---------- constants ----------------------------------------------------- */

const ROUTE_TYPE_META: Record<number, { label: string; color: string }> = {
  0: { label: 'Трамвай', color: '#F7941D' },
  1: { label: 'Метро', color: '#9B59B6' },
  3: { label: 'Автобус', color: '#BE1E2D' },
  11: { label: 'Тролей', color: '#27AAE1' },
}

const TYPE_ORDER = [3, 0, 11, 1]

/* ---------- props --------------------------------------------------------- */

export interface SidePanelProps {
  activePanel: string | null
  onClose: () => void
  onSelectRoute?: (routeId: string, routeType: number) => void
  onSelectStop?: (stop: { stop_id: string; stop_name: string; stop_lat: number; stop_lon: number }) => void
}

/* ---------- main component ------------------------------------------------ */

export default function SidePanel({ activePanel, onClose, onSelectRoute, onSelectStop }: SidePanelProps) {
  const isOpen = activePanel !== null && ['alerts', 'routes', 'stops'].includes(activePanel)

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && isOpen) onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [isOpen, onClose])

  const titles: Record<string, string> = {
    alerts: 'Известия',
    routes: 'Линии',
    stops: 'Спирки',
  }

  return (
    <aside
      className={`side-panel-shell fixed top-0 bottom-0 left-0 z-[700] flex flex-col overflow-x-hidden backdrop-blur-xl transition-transform duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] max-sm:top-[72px] max-sm:bottom-[60px] max-sm:left-1/2 max-sm:-translate-x-1/2 max-sm:rounded-2xl max-sm:shadow-[var(--shadow-lg)] max-sm:overflow-y-hidden ${
        isOpen
          ? 'translate-x-0 max-sm:translate-y-0'
          : '-translate-x-full max-sm:translate-x-0 max-sm:-translate-y-[130%]'
      }`}
      style={{
        background: 'var(--surface-overlay)',
        border: '1px solid var(--border)',
      }}
    >
      {isOpen && activePanel && (
        <>
          {/* Header */}
          <div className="flex items-center justify-between px-5 pt-5 pb-3 lg:px-7 lg:pt-7 lg:pb-4">
            <h2 className="side-panel-title font-semibold" style={{ color: 'var(--text)' }}>
              {titles[activePanel] ?? ''}
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="side-panel-close flex cursor-pointer items-center justify-center rounded-lg transition-colors"
              style={{ color: 'var(--text-muted)' }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--control-hover)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          {/* Panel body */}
          <div className="flex-1 overflow-y-auto px-4 pb-4 lg:px-7 lg:pb-7">
            {activePanel === 'alerts' && <AlertsPanel />}
            {activePanel === 'routes' && <RoutesPanel onSelectRoute={onSelectRoute} onClose={onClose} />}
            {activePanel === 'stops' && <StopsPanel onSelectStop={onSelectStop} onClose={onClose} />}
          </div>
        </>
      )}
    </aside>
  )
}

/* ========================================================================== */
/*  ALERTS PANEL                                                              */
/* ========================================================================== */

function AlertsPanel() {
  const [counts, setCounts] = useState<Record<number, number>>({})
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    async function load() {
      try {
        const res = await fetch('/api/realtime/vehicles')
        if (!res.ok || !active) return
        const data: VehicleSummary[] = await res.json()
        if (!active) return
        const c: Record<number, number> = {}
        for (const v of data) {
          // Map unknown route_type to the closest known type, or count separately
          const t = typeof v.route_type === 'number' ? v.route_type : -1
          c[t] = (c[t] ?? 0) + 1
        }
        setCounts(c)
        setTotal(data.length)
      } catch { /* ignore */ }
      finally { if (active) setLoading(false) }
    }
    load()
    const id = setInterval(load, 15_000)
    return () => { active = false; clearInterval(id) }
  }, [])

  if (loading) {
    return <p className="side-panel-text py-3" style={{ color: 'var(--text-muted)' }}>Зареждане...</p>
  }

  return (
    <div className="space-y-3">
      {/* Total active vehicles */}
      <div
        className="rounded-xl p-4"
        style={{ background: 'var(--surface-elevated)', border: '1px solid var(--border)' }}
      >
        <p className="text-2xl font-bold" style={{ color: 'var(--text)' }}>{total}</p>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>активни превозни средства</p>
      </div>

      {/* Per-type breakdown */}
      <div className="grid grid-cols-2 gap-2">
        {TYPE_ORDER.map((t) => {
          const meta = ROUTE_TYPE_META[t]
          if (!meta) return null
          const count = counts[t] ?? 0
          return (
            <div
              key={t}
              className="rounded-xl p-3"
              style={{ background: 'var(--surface-elevated)', border: '1px solid var(--border)' }}
            >
              <div className="flex items-center gap-2">
                <span
                  className="inline-block h-3 w-3 rounded-full"
                  style={{ background: meta.color }}
                />
                <span className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                  {meta.label}
                </span>
              </div>
              <p className="mt-1 text-xl font-bold" style={{ color: 'var(--text)' }}>{count}</p>
            </div>
          )
        })}
        {(counts[-1] ?? 0) > 0 && (
          <div
            className="rounded-xl p-3"
            style={{ background: 'var(--surface-elevated)', border: '1px solid var(--border)' }}
          >
            <div className="flex items-center gap-2">
              <span
                className="inline-block h-3 w-3 rounded-full"
                style={{ background: '#888' }}
              />
              <span className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                Други
              </span>
            </div>
            <p className="mt-1 text-xl font-bold" style={{ color: 'var(--text)' }}>{counts[-1]}</p>
          </div>
        )}
      </div>
    </div>
  )
}

/* ========================================================================== */
/*  ROUTES PANEL                                                              */
/* ========================================================================== */

function RoutesPanel({
  onSelectRoute,
  onClose,
}: {
  onSelectRoute?: (routeId: string, routeType: number) => void
  onClose: () => void
}) {
  const [routes, setRoutes] = useState<Route[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState<number | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let active = true
    async function load() {
      try {
        const res = await fetch('/api/routes')
        if (!res.ok || !active) return
        const data = await res.json()
        if (active && Array.isArray(data)) setRoutes(data)
      } catch { /* ignore */ }
      finally { if (active) setLoading(false) }
    }
    load()
    return () => { active = false }
  }, [])

  const filtered = useMemo(() => {
    let list = routes
    if (filterType !== null) list = list.filter((r) => r.route_type === filterType)
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(
        (r) =>
          r.route_short_name.toLowerCase().includes(q) ||
          r.route_long_name.toLowerCase().includes(q),
      )
    }
    // Sort: by route_type order, then numerically by short_name
    return list.sort((a, b) => {
      const ta = TYPE_ORDER.indexOf(a.route_type)
      const tb = TYPE_ORDER.indexOf(b.route_type)
      if (ta !== tb) return (ta === -1 ? 999 : ta) - (tb === -1 ? 999 : tb)
      const na = parseInt(a.route_short_name, 10)
      const nb = parseInt(b.route_short_name, 10)
      if (!isNaN(na) && !isNaN(nb)) return na - nb
      return a.route_short_name.localeCompare(b.route_short_name)
    })
  }, [routes, search, filterType])

  const handleSelect = useCallback(
    (r: Route) => {
      onSelectRoute?.(r.route_id, r.route_type)
      onClose()
    },
    [onSelectRoute, onClose],
  )

  if (loading) {
    return <p className="side-panel-text py-3" style={{ color: 'var(--text-muted)' }}>Зареждане...</p>
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Search */}
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

      {/* Type filter chips */}
      <div className="flex flex-wrap gap-1.5">
        <FilterChip active={filterType === null} onClick={() => setFilterType(null)} label="Всички" color="var(--text-secondary)" />
        {TYPE_ORDER.map((t) => {
          const meta = ROUTE_TYPE_META[t]
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

      {/* Route list */}
      <div className="space-y-1.5">
        {filtered.length === 0 && (
          <p className="side-panel-text py-2" style={{ color: 'var(--text-muted)' }}>
            Няма намерени линии.
          </p>
        )}
        {filtered.map((r) => {
          const meta = ROUTE_TYPE_META[r.route_type]
          return (
            <button
              key={r.route_id}
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
                {r.route_short_name}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium" style={{ color: 'var(--text)' }}>
                  {r.route_long_name || r.route_short_name}
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

/* ========================================================================== */
/*  STOPS PANEL                                                               */
/* ========================================================================== */

function StopsPanel({
  onSelectStop,
  onClose,
}: {
  onSelectStop?: (stop: Stop) => void
  onClose: () => void
}) {
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
    if (!search.trim()) return stops.slice(0, 100) // limit initial render
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
      {/* Search */}
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

      {/* Stop list */}
      <div className="space-y-1.5">
        {filtered.length === 0 && (
          <p className="side-panel-text py-2" style={{ color: 'var(--text-muted)' }}>
            Няма намерени спирки.
          </p>
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
              <p className="truncate text-sm font-medium" style={{ color: 'var(--text)' }}>
                {s.stop_name}
              </p>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                {s.stop_id}
              </p>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

/* ---------- shared chip component ----------------------------------------- */

function FilterChip({
  active,
  onClick,
  label,
  color,
}: {
  active: boolean
  onClick: () => void
  label: string
  color: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full px-2.5 py-1 text-xs font-semibold transition-all"
      style={{
        background: active ? color : 'var(--surface-elevated)',
        color: active ? '#fff' : 'var(--text-secondary)',
        border: `1px solid ${active ? color : 'var(--border)'}`,
      }}
    >
      {label}
    </button>
  )
}
