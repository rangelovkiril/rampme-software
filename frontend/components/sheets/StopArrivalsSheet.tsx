'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Stop, StopArrival } from '@/lib/types'
import { formatEta, getRouteColor } from '@/lib/transit'
import { distanceMeters } from '@/lib/geo'

interface StopArrivalsSheetProps {
  stop: Stop | null
  onClose: () => void
}

const ARRIVALS_LIMIT = 6
const POLL_INTERVAL = 15_000
const RAMP_PROXIMITY_METERS = 500
const MOBILE_SHEET_MIN_VH = 18
const MOBILE_SHEET_DEFAULT_VH = 56
const MOBILE_SHEET_MAX_VH = 92

/** Set to true to treat every bus as ramp-equipped (for testing) */
const RAMP_ALL = false

export default function StopArrivalsSheet({ stop, onClose }: StopArrivalsSheetProps) {
  const [arrivals, setArrivals] = useState<StopArrival[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [userPos, setUserPos] = useState<{ lat: number; lng: number } | null>(null)
  const [rampOnly, setRampOnly] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [mobileHeightVh, setMobileHeightVh] = useState(MOBILE_SHEET_DEFAULT_VH)
  const [isDragging, setIsDragging] = useState(false)
  const watchRef = useRef<number | null>(null)
  const dragStartYRef = useRef(0)
  const dragStartHeightRef = useRef(MOBILE_SHEET_DEFAULT_VH)

  // Track user geolocation for ramp proximity
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
      const res = await fetch(`/api/stops/${encodeURIComponent(stopId)}/vehicles?limit=${ARRIVALS_LIMIT}`)
      const data = res.ok ? await res.json() : []
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

  // Responsive
  useEffect(() => {
    const update = () => setIsMobile(window.innerWidth <= 640)
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  // Reset sheet height when stop changes
  useEffect(() => {
    if (stop) {
      setMobileHeightVh(MOBILE_SHEET_DEFAULT_VH)
      setIsDragging(false)
    }
  }, [stop])

  // --- Mobile drag-to-resize ---
  const clampHeight = (vh: number) => Math.min(MOBILE_SHEET_MAX_VH, Math.max(MOBILE_SHEET_MIN_VH, vh))

  const handleDragStart = useCallback((e: React.TouchEvent) => {
    if (!isMobile || !stop) return
    const touch = e.touches[0]
    if (!touch) return
    setIsDragging(true)
    dragStartYRef.current = touch.clientY
    dragStartHeightRef.current = mobileHeightVh
  }, [isMobile, stop, mobileHeightVh])

  const handleDragMove = useCallback((e: React.TouchEvent) => {
    if (!isDragging) return
    const touch = e.touches[0]
    if (!touch) return
    const deltaVh = ((dragStartYRef.current - touch.clientY) / window.innerHeight) * 100
    setMobileHeightVh(clampHeight(dragStartHeightRef.current + deltaVh))
    e.preventDefault()
  }, [isDragging])

  const handleDragEnd = useCallback(() => {
    if (!isDragging) return
    setIsDragging(false)
    setMobileHeightVh((h) => {
      if (h >= 80) return MOBILE_SHEET_MAX_VH
      if (h <= 32) return MOBILE_SHEET_MIN_VH
      return MOBILE_SHEET_DEFAULT_VH
    })
  }, [isDragging])

  const isOpen = Boolean(stop)
  const distToStop = (stop && userPos)
    ? distanceMeters(userPos.lat, userPos.lng, stop.stop_lat, stop.stop_lon)
    : null
  const isNearStop = distToStop !== null && distToStop <= RAMP_PROXIMITY_METERS
  const displayedArrivals = rampOnly ? arrivals.filter((a) => a.has_ramp) : arrivals
  const rampCount = arrivals.filter((a) => a.has_ramp).length

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[920] flex justify-center px-0 sm:px-4">
      <section
        className={`stop-sheet-shell pointer-events-auto flex w-full flex-col rounded-t-2xl border transition-transform ease-out max-sm:max-w-none ${
          isDragging ? 'duration-0' : 'duration-300'
        } ${isOpen ? 'translate-y-0' : 'translate-y-full'}`}
        style={{
          background: 'var(--surface-elevated)',
          borderColor: 'var(--border)',
          boxShadow: 'var(--shadow-lg)',
          color: 'var(--text)',
          height: isMobile && isOpen ? `${mobileHeightVh}vh` : undefined,
          maxHeight: isMobile && isOpen ? `${MOBILE_SHEET_MAX_VH}vh` : undefined,
        }}
      >
        {/* Drag handle */}
        <div
          className="flex touch-none justify-center pt-2 pb-1"
          onTouchStart={handleDragStart}
          onTouchMove={handleDragMove}
          onTouchEnd={handleDragEnd}
          onTouchCancel={handleDragEnd}
          role="presentation"
        >
          <div className="h-1 w-12 rounded-full" style={{ background: 'color-mix(in oklab, var(--text) 24%, transparent)' }} />
        </div>

        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-4 pt-1 pb-3">
          <div className="min-w-0">
            <p className="stop-sheet-title truncate font-semibold">{stop?.stop_name ?? ''}</p>
            <p className="stop-sheet-text" style={{ color: 'var(--text-secondary)' }}>{stop?.stop_id ?? ''}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setRampOnly((v) => !v)}
              className="stop-sheet-action flex items-center gap-1.5 rounded-full px-3 text-sm font-semibold transition-all"
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
              className="stop-sheet-action flex h-10 w-10 cursor-pointer items-center justify-center rounded-full text-sm"
              style={{ background: 'var(--control-bg)', color: 'var(--text-secondary)' }}
              aria-label="Close stop arrivals"
            >
              x
            </button>
          </div>
        </div>

        {/* Arrivals list */}
        <div
          className={`stop-sheet-scroll overflow-y-auto px-3 pb-4 ${isMobile && isOpen ? 'min-h-0 flex-1' : ''}`}
          style={isMobile && isOpen ? { maxHeight: 'none' } : undefined}
        >
          {loading && (
            <p className="stop-sheet-text px-2 py-3" style={{ color: 'var(--text-muted)' }}>Loading upcoming vehicles...</p>
          )}
          {!loading && error && (
            <p className="stop-sheet-text px-2 py-3" style={{ color: '#ef4444' }}>{error}</p>
          )}
          {!loading && !error && displayedArrivals.length === 0 && (
            <p className="stop-sheet-text px-2 py-3" style={{ color: 'var(--text-muted)' }}>
              {rampOnly ? 'No vehicles with ramp available for this stop right now.' : 'No active vehicles for this stop right now.'}
            </p>
          )}
          {!loading && !error && displayedArrivals.length > 0 && (
            <div className="space-y-2">
              {displayedArrivals.map((item) => {
                const routeColor = getRouteColor(item.route_type)
                const scheduled = item.scheduled_time ?? null
                const expected = item.expected_time ?? null
                const isDelayed = item.realtime && scheduled && expected && expected !== scheduled
                const canRequestRamp = isNearStop && (RAMP_ALL || item.has_ramp === true)

                return (
                  <div
                    key={item.id}
                    className="flex items-center justify-between gap-4 rounded-xl border px-4 py-3"
                    style={{
                      borderColor: 'var(--border)',
                      background: 'color-mix(in oklab, var(--surface-elevated) 85%, var(--text) 5%)',
                    }}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span
                        className="inline-flex h-8 min-w-12 items-center justify-center rounded-md px-2.5 text-base font-bold text-white"
                        style={{ background: routeColor }}
                      >
                        {item.route_short_name ?? '?'}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-lg font-semibold">{item.headsign ?? 'Route'}</p>
                        <p className="text-base font-medium" style={{ color: 'var(--text-secondary)' }}>
                          {item.realtime ? <span style={{ color: '#22c55e' }}>Live</span> : <span>Scheduled</span>}
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
                      <span className="text-xl font-bold whitespace-nowrap" style={{ color: item.realtime ? '#22c55e' : 'var(--text-secondary)' }}>
                        {formatEta(item.eta_minutes)}
                      </span>
                      <button
                        type="button"
                        disabled={!canRequestRamp}
                        onClick={() => { if (canRequestRamp) alert(`Ramp requested for ${item.route_short_name}!`) }}
                        className="stop-sheet-action h-10 rounded-lg px-3 py-1 text-base font-semibold transition-opacity"
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
