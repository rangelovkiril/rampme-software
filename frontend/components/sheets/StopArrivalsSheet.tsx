'use client'

import type { StopResponse as Stop, ArrivalResult as StopArrival } from '@backend/schemas'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useRamp } from '@/contexts/RampContext'
import { useSSE } from '@/hooks/useSSE'
import { api } from '@/lib/api'
import { formatEta, getRouteColor } from '@/lib/transit'

// Gap between top of sheet and bottom of floating nav
const TOP_GAP = 12
// Fallback viewport ratio for max height when nav can't be measured
const MAX_FALLBACK_RATIO = 0.85
// Matches the backend's own default; the arrivals list is capped at 50 there.
const ARRIVALS_LIMIT = 20

// How far below min-height the user must drag to dismiss
const DISMISS_OFFSET = 60

interface Props {
  stop: Stop | null
  onClose: () => void
  onVehicleLock?: (vehicleId: string) => void
}

export default function StopArrivalsSheet({ stop, onClose, onVehicleLock }: Props) {
  const [arrivals, setArrivals] = useState<StopArrival[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [rampOnly, setRampOnly] = useState(false)
  const [reservingId, setReservingId] = useState<string | null>(null)
  const [reserveError, setReserveError] = useState<string | null>(null)

  const [isOpen, setIsOpen] = useState(false)
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 640

  // Height state (mobile only)
  const headerRef = useRef<HTMLDivElement | null>(null)
  const [minHeight, setMinHeight] = useState(240)
  const [maxHeight, setMaxHeight] = useState(
    typeof window !== 'undefined' ? window.innerHeight * MAX_FALLBACK_RATIO : 600,
  )
  const [height, setHeight] = useState(360)

  // Drag state
  const dragging = useRef(false)
  const dragStartY = useRef(0)
  const dragStartHeight = useRef(0)

  const { reserveBoard, isReserved } = useRamp()

  const sseArrivals = useSSE<StopArrival[]>(
    stop ? `/stops/${encodeURIComponent(stop.id)}/vehicles/stream?limit=20` : null,
  )

  // ─── Measure bounds relative to FloatingNav ──────────────────────────
  const measure = useCallback(() => {
    if (typeof window === 'undefined') return

    // min = handle + header + some breathing room for 1 row (~80px)
    const headerH = headerRef.current?.offsetHeight ?? 64
    const handleH = 16 // pt-2 pb-1 + pill height
    const computedMin = handleH + headerH + 100

    // max = space between bottom of viewport and bottom of floating nav
    let computedMax = window.innerHeight * MAX_FALLBACK_RATIO
    const nav = document.querySelector<HTMLElement>('[data-floating-nav]')
    if (nav) {
      const navRect = nav.getBoundingClientRect()
      computedMax = window.innerHeight - navRect.bottom - TOP_GAP
    }
    if (computedMax < computedMin + 40) computedMax = computedMin + 40

    setMinHeight(computedMin)
    setMaxHeight(computedMax)
    setHeight((h) => Math.min(Math.max(h, computedMin), computedMax))
    return { min: computedMin, max: computedMax }
  }, [])

  // The stop's name changes the header height, so the bounds are re-measured with it.
  // biome-ignore lint/correctness/useExhaustiveDependencies: deliberate.
  useLayoutEffect(() => {
    measure()
  }, [measure, stop])

  useEffect(() => {
    const onResize = () => measure()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [measure])

  useEffect(() => {
    if (!stop) {
      setIsOpen(false)
      return
    }
    setIsOpen(true)
    setArrivals([])
    setError(null)
    setRampOnly(false)
    setReserveError(null)
    setLoading(true)
    // Open at a reasonable default — around 60% of available range
    requestAnimationFrame(() => {
      const bounds = measure()
      if (!bounds) return
      const target = bounds.min + (bounds.max - bounds.min) * 0.6
      setHeight(Math.min(Math.max(target, bounds.min), bounds.max))
    })
  }, [stop, measure])

  useEffect(() => {
    if (!stop) return

    let active = true
    const controller = new AbortController()

    const loadArrivals = async () => {
      try {
        const { data, error: requestError } = await api.stops({ id: stop.id }).vehicles.get({
          query: { limit: String(ARRIVALS_LIMIT) },
          fetch: { signal: controller.signal },
        })
        if (controller.signal.aborted || !active) return
        if (requestError) throw requestError

        if (!controller.signal.aborted && active) {
          setArrivals(data ?? [])
          setError(null)
        }
      } catch {
        if (!controller.signal.aborted && active) {
          setError('Неуспешно зареждане на пристигащи превозни средства.')
        }
      } finally {
        if (!controller.signal.aborted && active) {
          setLoading(false)
        }
      }
    }

    loadArrivals()

    return () => {
      active = false
      controller.abort()
    }
  }, [stop])

  useEffect(() => {
    if (!sseArrivals) return
    setArrivals(sseArrivals)
    setLoading(false)
    setError(null)
  }, [sseArrivals])

  const sortedArrivals = useMemo(() => {
    const list = rampOnly ? arrivals.filter((a) => a.hasRamp) : arrivals
    return [...list].sort((a, b) => {
      const etaDiff = a.etaMinutes - b.etaMinutes
      if (etaDiff !== 0) return etaDiff
      if (a.hasRamp === b.hasRamp) return 0
      return a.hasRamp ? -1 : 1
    })
  }, [arrivals, rampOnly])

  const rampCount = arrivals.filter((a) => a.hasRamp).length

  const handleDragStart = (e: React.TouchEvent) => {
    dragging.current = true
    dragStartY.current = e.touches[0].clientY
    dragStartHeight.current = height
  }
  const handleDragMove = (e: React.TouchEvent) => {
    if (!dragging.current) return
    const y = e.touches[0].clientY
    const delta = dragStartY.current - y
    const raw = dragStartHeight.current + delta

    let h = raw
    if (h > maxHeight) h = maxHeight + (h - maxHeight) * 0.25
    if (h < minHeight) h = minHeight + (h - minHeight) * 0.6

    setHeight(h)
  }
  const handleDragEnd = () => {
    if (!dragging.current) return
    dragging.current = false
    if (height < minHeight - DISMISS_OFFSET) {
      setIsOpen(false)
      onClose()
      return
    }
    if (height < minHeight) setHeight(minHeight)
    else if (height > maxHeight) setHeight(maxHeight)
  }

  const handleReserve = async (vehicleId: string) => {
    if (!stop || reservingId) return
    setReservingId(vehicleId)
    setReserveError(null)
    try {
      const routeShortName = arrivals.find((a) => a.vehicleId === vehicleId)?.routeShortName ?? null
      const res = await reserveBoard(vehicleId, stop.id, routeShortName)
      if (res) {
        if (onVehicleLock) onVehicleLock(vehicleId)
      } else {
        setReserveError('Грешка при резервация. Опитайте отново.')
      }
    } finally {
      setReservingId(null)
    }
  }

  if (!stop) return null

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[920] flex justify-center px-0 sm:px-4">
      <section
        className={`stop-sheet-shell pointer-events-auto flex w-full flex-col rounded-t-2xl border ease-out max-sm:max-w-none ${
          isOpen ? 'translate-y-0' : 'translate-y-full'
        }`}
        style={{
          background: 'var(--surface-elevated)',
          borderColor: 'var(--border)',
          boxShadow: 'var(--shadow-lg)',
          color: 'var(--text)',
          height: isMobile && isOpen ? `${height}px` : undefined,
          maxHeight: isMobile && isOpen ? `${maxHeight}px` : undefined,
          transition: dragging.current
            ? 'none'
            : 'height 0.28s cubic-bezier(0.32, 0.72, 0, 1), transform 0.3s',
          willChange: 'height',
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
          <div
            className="h-1 w-12 rounded-full"
            style={{
              background: 'color-mix(in oklab, var(--text) 24%, transparent)',
            }}
          />
        </div>

        {/* Header */}
        <div ref={headerRef} className="flex items-start justify-between gap-3 px-4 pt-1 pb-3">
          <div className="min-w-0 flex-1">
            <p className="stop-sheet-title truncate font-semibold">{stop.name}</p>
            <p className="stop-sheet-text" style={{ color: 'var(--text-secondary)' }}>
              {stop.id}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setRampOnly((v) => !v)}
              aria-label={
                rampOnly ? `Покажи всички (${rampCount})` : 'Покажи само превозни средства с рампа'
              }
              className="stop-sheet-action flex items-center gap-1.5 rounded-full px-3 text-sm font-semibold transition-all"
              style={{
                background: rampOnly ? '#3b82f6' : 'var(--control-bg)',
                color: rampOnly ? '#fff' : 'var(--text-secondary)',
                border: rampOnly ? 'none' : '1px solid var(--border)',
              }}
              title={rampOnly ? 'Покажи всички' : 'Само с рампа'}
            >
              <svg
                role="img"
                aria-label={rampOnly ? 'Покажи всички' : 'Само с рампа'}
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <title>{rampOnly ? 'Покажи всички' : 'Само с рампа'}</title>
                <circle cx="10" cy="17.5" r="3.5" />
                <path d="M18 4a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" fill="currentColor" stroke="none" />
                <path d="M17 7l-5 5" />
                <path d="M12 12l-5 5" />
                <path d="M17 7v6" />
              </svg>
              {rampOnly ? `Само с рампа (${rampCount})` : 'Всички'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="stop-sheet-action flex h-10 w-10 cursor-pointer items-center justify-center rounded-full text-sm"
              style={{
                background: 'var(--control-bg)',
                color: 'var(--text-secondary)',
              }}
              aria-label="Затвори"
            >
              x
            </button>
          </div>
        </div>

        {/* Arrivals */}
        <div
          className={`stop-sheet-scroll overflow-y-auto px-3 pb-4 ${isMobile && isOpen ? 'min-h-0 flex-1' : ''}`}
          style={isMobile && isOpen ? { maxHeight: 'none' } : undefined}
        >
          {reserveError && (
            <p className="px-2 py-2 text-sm font-medium" style={{ color: '#ef4444' }}>
              {reserveError}
            </p>
          )}
          {loading && (
            <p className="px-2 py-3" style={{ color: 'var(--text-muted)' }}>
              Зареждане...
            </p>
          )}
          {!loading && error && (
            <p className="px-2 py-3" style={{ color: '#ef4444' }}>
              {error}
            </p>
          )}
          {!loading && !error && sortedArrivals.length === 0 && (
            <p className="px-2 py-3" style={{ color: 'var(--text-muted)' }}>
              {rampOnly
                ? 'Няма превозни средства с рампа в момента.'
                : 'Няма активни превозни средства в момента.'}
            </p>
          )}
          {!loading && !error && sortedArrivals.length > 0 && (
            <div className="space-y-2">
              {sortedArrivals.map((item) => {
                const routeColor = getRouteColor(item.routeType)
                const scheduled = item.scheduledTime ?? null
                const expected = item.expectedTime ?? null
                const isDelayed = item.realtime && scheduled && expected && expected !== scheduled
                const vehicleId = item.vehicleId
                const canRequest = Boolean(vehicleId)
                const reserved = vehicleId ? isReserved(vehicleId, stop.id) : false
                const isReserving = reservingId === vehicleId

                return (
                  <div
                    key={item.id}
                    className="flex items-center gap-3 rounded-xl border px-3 py-3"
                    style={{
                      lineHeight: 1.2,
                      borderColor: reserved ? '#3b82f6' : 'var(--border)',
                      background: reserved
                        ? 'color-mix(in oklab, #3b82f6 12%, var(--surface-elevated) 88%)'
                        : 'color-mix(in oklab, var(--surface-elevated) 85%, var(--text) 5%)',
                    }}
                  >
                    {/* Route badge */}
                    <span
                      className="inline-flex h-9 min-w-12 items-center justify-center rounded-md px-2.5 text-base font-bold text-white shrink-0"
                      style={{ background: routeColor }}
                    >
                      {item.routeShortName ?? '?'}
                    </span>

                    {/* Middle: headsign + status + vehicle id */}
                    <div className="min-w-0 flex-1">
                      {/* Headsign */}
                      <div className="truncate text-base font-semibold">
                        {item.headsign ?? 'Линия'}
                      </div>

                      {/* Status line — time only (no "В реално" label) */}
                      <div
                        className="flex items-center gap-1.5 text-sm whitespace-nowrap"
                        style={{ color: 'var(--text-secondary)', marginTop: 2 }}
                      >
                        {isDelayed ? (
                          <>
                            <span
                              style={{
                                textDecoration: 'line-through',
                                opacity: 0.5,
                              }}
                            >
                              {scheduled}
                            </span>
                            <span style={{ color: '#f59e0b', fontWeight: 600 }}>{expected}</span>
                          </>
                        ) : expected ? (
                          <span
                            style={{
                              color: item.realtime ? '#22c55e' : 'var(--text-secondary)',
                              fontWeight: 600,
                            }}
                          >
                            {expected}
                          </span>
                        ) : scheduled ? (
                          <span>{scheduled}</span>
                        ) : null}
                      </div>
                    </div>

                    {/* Right: ETA + ramp button, center-aligned stack */}
                    <div className="flex flex-col items-center gap-1.5 shrink-0">
                      <span
                        className="text-xl font-bold leading-none whitespace-nowrap"
                        style={{
                          color: item.realtime ? '#22c55e' : 'var(--text-secondary)',
                        }}
                      >
                        {formatEta(item.etaMinutes)}
                      </span>

                      <button
                        type="button"
                        aria-label={`${reserved ? 'Резервирана' : 'Резервирай'} рампа за качване на ${stop.name}`}
                        disabled={!canRequest || reserved || isReserving}
                        onClick={() => vehicleId && handleReserve(vehicleId)}
                        className="stop-sheet-action rounded-lg px-3 py-1.5 text-sm font-semibold transition-all whitespace-nowrap"
                        style={{
                          background: reserved
                            ? '#22c55e'
                            : isReserving
                              ? '#6b7280'
                              : canRequest
                                ? routeColor
                                : 'color-mix(in oklab, var(--control-bg) 88%, var(--text) 6%)',
                          color: canRequest || reserved ? '#fff' : 'var(--text-muted)',
                          border: canRequest || reserved ? 'none' : '1px solid var(--border)',
                          opacity: canRequest || reserved ? 1 : 0.5,
                          cursor:
                            canRequest && !reserved && !isReserving ? 'pointer' : 'not-allowed',
                        }}
                        title={
                          reserved
                            ? 'Резервация за качване'
                            : canRequest
                              ? 'Резервирай рампа за качване'
                              : 'Няма данни за превозното средство'
                        }
                      >
                        {reserved
                          ? 'Резервирана'
                          : isReserving
                            ? '...'
                            : canRequest || vehicleId
                              ? 'Качване'
                              : 'Няма данни'}
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
