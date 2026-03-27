'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Stop, StopArrival } from './StopsLayer'

interface StopArrivalsSheetProps {
  stop: Stop | null
  onClose: () => void
}

const ARRIVALS_LIMIT = 20
const POLL_INTERVAL = 15_000
const RAMP_PROXIMITY_METERS = 500

/** Toggle ramp availability mode:
 *  true  = ramp button enabled for every bus when near stop (for testing)
 *  false = ramp button only enabled for buses with has_ramp data */
const RAMP_ALL = false

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

/** Haversine distance in meters between two lat/lng points */
function distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  const toRad = (v: number) => (v * Math.PI) / 180
  const R = 6_371_000
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export default function StopArrivalsSheet({ stop, onClose }: StopArrivalsSheetProps) {
  const [arrivals, setArrivals] = useState<StopArrival[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [userPos, setUserPos] = useState<{ lat: number; lng: number } | null>(null)
  const [rampOnly, setRampOnly] = useState(false)
  const watchRef = useRef<number | null>(null)

  // Track user geolocation for ramp button proximity check
  useEffect(() => {
    if (!navigator.geolocation) return
    watchRef.current = navigator.geolocation.watchPosition(
      (pos) => setUserPos({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {},
      { enableHighAccuracy: true, maximumAge: 10_000 }
    )
    return () => {
      if (watchRef.current !== null) navigator.geolocation.clearWatch(watchRef.current)
    }
  }, [])

  const fetchArrivals = useCallback(async (stopId: string, isInitial: boolean) => {
    if (isInitial) setLoading(true)
    try {
      const response = await fetch(
        `/api/stops/${encodeURIComponent(stopId)}/vehicles?limit=${ARRIVALS_LIMIT}`,
      )
      const data = response.ok ? await response.json() : []
      setArrivals(Array.isArray(data) ? (data as StopArrival[]) : [])
      setError(null)
    } catch {
      if (isInitial) {
        setError('Could not load upcoming vehicles.')
        setArrivals([])
      }
    } finally {
      if (isInitial) setLoading(false)
    }
  }, [])

  // Fetch on stop change + auto-refresh every 15s
  useEffect(() => {
    if (!stop) {
      setArrivals([])
      setLoading(false)
      setError(null)
      setRampOnly(false)
      return
    }

    fetchArrivals(stop.stop_id, true)
    const id = setInterval(() => fetchArrivals(stop.stop_id, false), POLL_INTERVAL)
    return () => clearInterval(id)
  }, [stop, fetchArrivals])

  const isOpen = Boolean(stop)

  // Distance from user to stop (if available)
  const distToStop = (stop && userPos)
    ? distanceMeters(userPos.lat, userPos.lng, stop.stop_lat, stop.stop_lon)
    : null
  const isNearStop = distToStop !== null && distToStop <= RAMP_PROXIMITY_METERS

  // Filter arrivals when ramp-only filter is active
  const displayedArrivals = rampOnly ? arrivals.filter((a) => a.has_ramp) : arrivals
  const rampCount = arrivals.filter((a) => a.has_ramp).length

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
          <div className="flex items-center gap-2">
            {/* Ramp-only filter toggle */}
            <button
              type="button"
              onClick={() => setRampOnly((v) => !v)}
              className="flex h-8 items-center gap-1 rounded-full px-3 text-xs font-semibold transition-all"
              style={{
                background: rampOnly ? '#3b82f6' : 'var(--control-bg)',
                color: rampOnly ? '#fff' : 'var(--text-secondary)',
                border: rampOnly ? 'none' : '1px solid var(--border)',
              }}
              title={rampOnly ? 'Show all vehicles' : 'Show only vehicles with ramp'}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="10" cy="17.5" r="3.5" />
                <path d="M18 4a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" fill="currentColor" stroke="none" />
                <path d="M17 7l-5 5" />
                <path d="M12 12l-5 5" />
                <path d="M17 7v6" />
              </svg>
              {rampOnly ? `Ramp (${rampCount})` : 'Ramp'}
            </button>
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

          {!loading && !error && displayedArrivals.length === 0 && (
            <p className="px-2 py-3 text-sm" style={{ color: 'var(--text-muted)' }}>
              {rampOnly
                ? 'No vehicles with ramp available for this stop right now.'
                : 'No active vehicles for this stop right now.'}
            </p>
          )}

          {!loading && !error && displayedArrivals.length > 0 && (
            <div className="space-y-2">
              {displayedArrivals.map((item) => {
                const routeColor =
                  typeof item.route_type === 'number'
                    ? (ROUTE_COLORS[item.route_type] ?? '#BE1E2D')
                    : '#BE1E2D'

                // Show both scheduled and expected time when they differ (delayed/early)
                const scheduled = item.scheduled_time ?? null
                const expected = item.expected_time ?? null
                const isDelayed = item.realtime && scheduled && expected && expected !== scheduled

                const canRequestRamp = isNearStop && (RAMP_ALL || item.has_ramp === true)

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
                          {item.realtime && (
                            <span style={{ color: '#22c55e' }}>Live</span>
                          )}
                          {!item.realtime && <span>Scheduled</span>}
                          {isDelayed ? (
                            <>
                              {' · '}
                              <span style={{ textDecoration: 'line-through', opacity: 0.5 }}>{scheduled}</span>
                              {' '}
                              <span style={{ color: '#f59e0b' }}>{expected}</span>
                            </>
                          ) : (
                            scheduled ? ` · ${scheduled}` : ''
                          )}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold whitespace-nowrap" style={{ color: item.realtime ? '#22c55e' : 'var(--text-secondary)' }}>
                        {formatEta(item.eta_minutes)}
                      </span>
                      <button
                        type="button"
                        disabled={!canRequestRamp}
                        onClick={() => {
                          if (canRequestRamp) alert(`Ramp requested for ${item.route_short_name}!`)
                        }}
                        className="rounded-lg px-2 py-1 text-xs font-semibold transition-opacity"
                        style={{
                          background: canRequestRamp ? routeColor : 'color-mix(in oklab, var(--control-bg) 88%, var(--text) 6%)',
                          color: canRequestRamp ? '#fff' : 'var(--text-muted)',
                          border: canRequestRamp ? 'none' : '1px solid var(--border)',
                          opacity: canRequestRamp ? 1 : 0.5,
                          cursor: canRequestRamp ? 'pointer' : 'not-allowed',
                        }}
                        title={canRequestRamp ? 'Request wheelchair ramp' : `Move within ${RAMP_PROXIMITY_METERS}m of the stop to request a ramp`}
                      >
                        Ramp
                      </button>
                    </div>
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
