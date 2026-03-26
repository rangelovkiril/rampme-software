'use client'

import { useEffect, useState } from 'react'
import type { Stop, StopArrival } from './StopsLayer'

interface StopArrivalsSheetProps {
  stop: Stop | null
  onClose: () => void
}

const ARRIVALS_LIMIT = 20

const ROUTE_COLORS: Record<number, string> = {
  0: '#F7941D',
  1: '#9B59B6',
  3: '#BE1E2D',
  11: '#27AAE1'
}

function formatEta(minutes?: number) {
  if (typeof minutes !== 'number' || !Number.isFinite(minutes)) return 'Soon'
  if (minutes <= 0) return 'Now'
  return `${minutes} min`
}

export default function StopArrivalsSheet({ stop, onClose }: StopArrivalsSheetProps) {
  const [arrivals, setArrivals] = useState<StopArrival[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    async function loadArrivals() {
      if (!stop) {
        setArrivals([])
        setLoading(false)
        setError(null)
        return
      }

      setLoading(true)
      setError(null)

      try {
        const response = await fetch(
          `/api/stops/${encodeURIComponent(stop.stop_id)}/vehicles?limit=${ARRIVALS_LIMIT}`,
        )
        const data = response.ok ? await response.json() : []

        if (!active) return
        setArrivals(Array.isArray(data) ? (data as StopArrival[]) : [])
      } catch {
        if (!active) return
        setError('Could not load upcoming vehicles.')
        setArrivals([])
      } finally {
        if (active) setLoading(false)
      }
    }

    loadArrivals()

    return () => {
      active = false
    }
  }, [stop])

  const isOpen = Boolean(stop)

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[920] flex justify-center px-0 sm:px-4">
      <section
        className={`pointer-events-auto w-full max-w-[420px] rounded-t-2xl border transition-transform duration-300 ease-out max-sm:max-w-none ${
          isOpen ? 'translate-y-0' : 'translate-y-full'
        }`}
        style={{
          background: 'var(--surface-elevated)',
          borderColor: 'var(--border)',
          boxShadow: 'var(--shadow-lg)',
          color: 'var(--text)'
        }}
      >
        <div className="flex justify-center pt-2 pb-1">
          <div
            className="h-1 w-12 rounded-full"
            style={{ background: 'color-mix(in oklab, var(--text) 24%, transparent)' }}
          />
        </div>

        <div className="flex items-start justify-between gap-3 px-4 pt-1 pb-3">
          <div className="min-w-0">
            <p className="truncate text-base font-semibold">{stop?.stop_name ?? ''}</p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {stop?.stop_id ?? ''}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-sm"
            style={{ background: 'var(--control-bg)', color: 'var(--text-secondary)' }}
            aria-label="Close stop arrivals"
          >
            x
          </button>
        </div>

        <div className="max-h-[54vh] overflow-y-auto px-3 pb-4">
          {loading && (
            <p className="px-2 py-3 text-sm" style={{ color: 'var(--text-muted)' }}>
              Loading upcoming vehicles...
            </p>
          )}

          {!loading && error && (
            <p className="px-2 py-3 text-sm" style={{ color: '#ef4444' }}>
              {error}
            </p>
          )}

          {!loading && !error && arrivals.length === 0 && (
            <p className="px-2 py-3 text-sm" style={{ color: 'var(--text-muted)' }}>
              No active vehicles for this stop right now.
            </p>
          )}

          {!loading && !error && arrivals.length > 0 && (
            <div className="space-y-2">
              {arrivals.map((item) => {
                const routeColor =
                  typeof item.route_type === 'number'
                    ? (ROUTE_COLORS[item.route_type] ?? '#BE1E2D')
                    : '#BE1E2D'

                return (
                  <div
                    key={item.id}
                    className="flex items-center justify-between gap-3 rounded-xl border px-3 py-2"
                    style={{
                      borderColor: 'var(--border)',
                      background: 'color-mix(in oklab, var(--surface-elevated) 85%, var(--text) 5%)'
                    }}
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <span
                        className="inline-flex h-6 min-w-8 items-center justify-center rounded-md px-2 text-xs font-bold text-white"
                        style={{ background: routeColor }}
                      >
                        {item.route_short_name ?? '?'}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-xs font-medium">{item.headsign ?? 'Route'}</p>
                        <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                          ETA {formatEta(item.eta_minutes)}
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      className="rounded-lg px-2 py-1 text-xs font-semibold"
                      style={{
                        background: 'color-mix(in oklab, var(--control-bg) 88%, var(--text) 6%)',
                        color: 'var(--text-secondary)',
                        border: '1px solid var(--border)'
                      }}
                    >
                      Ramp
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
