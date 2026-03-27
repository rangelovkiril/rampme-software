'use client'

import { useCallback, useEffect, useState } from 'react'
import type { Vehicle } from './VehiclesLayer'

const POLL_INTERVAL = 15_000

const ROUTE_COLORS: Record<number, string> = {
  0: '#F7941D',
  1: '#9B59B6',
  3: '#BE1E2D',
  11: '#27AAE1',
}

const TYPE_ICONS: Record<number, string> = {
  0: 'Трамвай',
  3: 'Автобус',
  11: 'Тролей',
  1: 'Метро',
}

interface TripStop {
  stop_id: string
  stop_name: string
  stop_sequence: number
  scheduled_time: string
  expected_time: string | null
  eta_minutes: number | null
  status: 'departed' | 'delay' | 'on_time' | 'scheduled'
  delay_minutes: number
}

interface TripData {
  vehicle_id: string
  trip_id: string
  route_id: string
  route_short_name: string | null
  route_type: number | null
  headsign: string | null
  stops: TripStop[]
}

interface VehicleTripSheetProps {
  vehicle: Vehicle | null
  onClose: () => void
}

export default function VehicleTripSheet({ vehicle, onClose }: VehicleTripSheetProps) {
  const [trip, setTrip] = useState<TripData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchTrip = useCallback(async (vehicleId: string, isInitial: boolean) => {
    if (isInitial) setLoading(true)
    try {
      const res = await fetch(`/api/realtime/vehicles/${encodeURIComponent(vehicleId)}/trip`)
      if (!res.ok) {
        if (isInitial) setError('Could not load trip data.')
        return
      }
      const data: TripData = await res.json()
      setTrip(data)
      setError(null)
    } catch {
      if (isInitial) {
        setError('Could not load trip data.')
        setTrip(null)
      }
    } finally {
      if (isInitial) setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!vehicle) {
      setTrip(null)
      setLoading(false)
      setError(null)
      return
    }

    fetchTrip(vehicle.id, true)
    const id = setInterval(() => fetchTrip(vehicle.id, false), POLL_INTERVAL)
    return () => clearInterval(id)
  }, [vehicle, fetchTrip])

  const isOpen = Boolean(vehicle)
  const routeType = trip?.route_type ?? vehicle?.route_type ?? 3
  const routeColor = ROUTE_COLORS[routeType] ?? '#BE1E2D'
  const routeName = trip?.route_short_name ?? vehicle?.route_short_name ?? '?'
  const headsign = trip?.headsign ?? vehicle?.headsign ?? ''

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
          color: 'var(--text)',
        }}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-2 pb-1">
          <div
            className="h-1 w-12 rounded-full"
            style={{ background: 'color-mix(in oklab, var(--text) 24%, transparent)' }}
          />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-4 pt-1 pb-3">
          <div className="flex min-w-0 items-center gap-2.5">
            {/* Vehicle type icon */}
            <svg width="20" height="20" viewBox="0 0 24 24" fill={routeColor} stroke="none" style={{ flexShrink: 0 }}>
              <path d="M5 11V7a7 7 0 0 1 14 0v4" />
              <rect x="3" y="11" width="18" height="8" rx="2" />
              <circle cx="7.5" cy="21.5" r="1.5" />
              <circle cx="16.5" cy="21.5" r="1.5" />
            </svg>
            {/* Route badge */}
            <span
              className="inline-flex h-7 min-w-10 items-center justify-center rounded-md px-2.5 text-sm font-bold text-white"
              style={{ background: routeColor }}
            >
              {routeName}
            </span>
            {/* Headsign */}
            <p className="truncate text-sm font-semibold">{headsign}</p>
          </div>

          <div className="flex items-center gap-1.5" style={{ flexShrink: 0 }}>
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-sm font-bold"
              style={{ background: 'var(--control-bg)', color: 'var(--text-secondary)' }}
              aria-label="Close vehicle trip"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        {/* Stop list */}
        <div className="max-h-[54vh] overflow-y-auto px-4 pb-4">
          {loading && (
            <p className="py-3 text-sm" style={{ color: 'var(--text-muted)' }}>
              Loading trip stops...
            </p>
          )}

          {!loading && error && (
            <p className="py-3 text-sm" style={{ color: '#ef4444' }}>{error}</p>
          )}

          {!loading && !error && trip && trip.stops.length > 0 && (() => {
            // Show last 2 departed stops (grey context) + all upcoming stops
            const firstUpcomingIdx = trip.stops.findIndex((s) => s.status !== 'departed')
            const startIdx = firstUpcomingIdx > 0
              ? Math.max(0, firstUpcomingIdx - 2)
              : firstUpcomingIdx === -1
                ? Math.max(0, trip.stops.length - 2) // all departed — show last 2
                : 0
            const visibleStops = trip.stops.slice(startIdx)

            return (
              <div className="relative">
                {visibleStops.map((stop, i) => {
                  const isLast = i === visibleStops.length - 1
                  const isDeparted = stop.status === 'departed'
                  const isDelay = stop.status === 'delay'
                  const isOnTime = stop.status === 'on_time'

                  return (
                    <div key={stop.stop_id + '-' + stop.stop_sequence} className="relative flex gap-3" style={{ minHeight: 52 }}>
                      {/* Timeline column */}
                      <div className="flex flex-col items-center" style={{ width: 16, flexShrink: 0 }}>
                        <div
                          className="rounded-full"
                          style={{
                            width: 10,
                            height: 10,
                            marginTop: 5,
                            background: isDeparted ? 'var(--text-muted)' : routeColor,
                            border: `2px solid ${isDeparted ? 'var(--text-muted)' : routeColor}`,
                            flexShrink: 0,
                          }}
                        />
                        {!isLast && (
                          <div
                            style={{
                              width: 2,
                              flex: 1,
                              background: isDeparted ? 'var(--text-muted)' : routeColor,
                              opacity: isDeparted ? 0.3 : 0.5,
                            }}
                          />
                        )}
                      </div>

                      {/* Stop content */}
                      <div className="flex flex-1 items-start justify-between gap-2 pb-3">
                        <div className="min-w-0" style={{ color: isDeparted ? 'var(--text-muted)' : undefined }}>
                          <p className={`text-sm ${isDeparted ? '' : 'font-semibold'}`}>
                            {stop.stop_name}
                          </p>
                          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                            {isDeparted && (
                              <>
                                <span>Departed</span>
                                {stop.scheduled_time && <span> · {stop.scheduled_time}</span>}
                              </>
                            )}
                            {isDelay && stop.delay_minutes > 0 && (
                              <>
                                <span style={{ color: '#ef4444' }}>
                                  {stop.delay_minutes} min delay
                                </span>
                                {' · '}
                                <span style={{ textDecoration: 'line-through', opacity: 0.5 }}>
                                  {stop.scheduled_time}
                                </span>
                                {' '}
                                <span style={{ color: '#f59e0b' }}>{stop.expected_time}</span>
                              </>
                            )}
                            {isOnTime && (
                              <>
                                <span style={{ color: '#22c55e' }}>On time</span>
                                {stop.scheduled_time && <span> · {stop.scheduled_time}</span>}
                              </>
                            )}
                            {stop.status === 'scheduled' && (
                              <>
                                <span>Scheduled</span>
                                {stop.scheduled_time && <span> · {stop.scheduled_time}</span>}
                              </>
                            )}
                          </p>
                        </div>

                        {/* ETA + Ramp — only for upcoming stops */}
                        {!isDeparted && (
                          <div className="flex items-center gap-2" style={{ flexShrink: 0 }}>
                            {stop.eta_minutes !== null && (
                              <div className="text-right">
                                <p className="text-base font-bold">{stop.eta_minutes}</p>
                                <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>min</p>
                              </div>
                            )}
                            <button
                              type="button"
                              onClick={() => alert(`Ramp requested for ${routeName} at ${stop.stop_name}!`)}
                              className="rounded-lg px-2 py-1 text-xs font-semibold cursor-pointer"
                              style={{
                                background: routeColor,
                                color: '#fff',
                              }}
                              title={`Request wheelchair ramp at ${stop.stop_name}`}
                            >
                              Ramp
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          })()}
        </div>
      </section>
    </div>
  )
}
