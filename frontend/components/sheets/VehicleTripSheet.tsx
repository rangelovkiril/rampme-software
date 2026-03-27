'use client'

import { useCallback, useEffect, useState } from 'react'
import type { Vehicle, TripData } from '@/lib/types'
import { getRouteColor, getRouteLabel } from '@/lib/transit'
import { useRamp } from '@/contexts/RampContext'

const POLL_INTERVAL = 15_000

function StopStatusLabel({ stop }: { stop: TripData['stops'][number] }) {
  if (stop.status === 'departed') return <span>Departed{stop.expected_time ? ` ${stop.expected_time}` : ''}</span>
  if (stop.realtime && stop.expected_time) {
    return (
      <span>
        {stop.status === 'delay' && (
          <><span style={{ textDecoration: 'line-through', opacity: 0.4 }}>{stop.scheduled_time}</span>{' '}</>
        )}
        <span style={{ color: stop.status === 'delay' ? '#f59e0b' : '#22c55e' }}>{stop.expected_time}</span>
      </span>
    )
  }
  return <span>{stop.scheduled_time ?? ''}</span>
}

interface Props {
  vehicle: Vehicle | null
  onClose: () => void
}

export default function VehicleTripSheet({ vehicle, onClose }: Props) {
  const [trip, setTrip] = useState<TripData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reservingStopId, setReservingStopId] = useState<string | null>(null)
  const [boardingStopId, setBoardingStopId] = useState<string | null>(null)

  const { reserveAlight, reserveBoard, cancel, reservations, lockedVehicleId, isReserved } = useRamp()

  const boardingRes = reservations.find(
    (r) => r.vehicle_id === vehicle?.id && r.type === 'board' && (r.status === 'pending' || r.status === 'active'),
  )
  const alightingRes = reservations.find(
    (r) => r.vehicle_id === vehicle?.id && r.type === 'alight' && (r.status === 'pending' || r.status === 'active'),
  )
  const isLocked = lockedVehicleId === vehicle?.id

  const fetchTrip = useCallback(async (vehicleId: string, initial: boolean) => {
    if (initial) setLoading(true)
    try {
      const r = await fetch(`/api/realtime/vehicles/${encodeURIComponent(vehicleId)}/trip`)
      if (!r.ok) { if (initial) setError('Could not load trip data.'); return }
      setTrip(await r.json())
      setError(null)
    } catch {
      if (initial) setError('Could not load trip data.')
    } finally {
      if (initial) setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!vehicle) { setTrip(null); return }
    setError(null)
    fetchTrip(vehicle.id, true)
    const iv = setInterval(() => fetchTrip(vehicle.id, false), POLL_INTERVAL)
    return () => clearInterval(iv)
  }, [vehicle, fetchTrip])

  const handleReserveAlight = async (stopId: string) => {
    if (!vehicle || reservingStopId) return
    setReservingStopId(stopId)
    try {
      await reserveAlight(vehicle.id, stopId)
    } finally {
      setReservingStopId(null)
    }
  }

  const handleReserveBoard = async (stopId: string) => {
    if (!vehicle || boardingStopId) return
    setBoardingStopId(stopId)
    try {
      await reserveBoard(vehicle.id, stopId)
    } finally {
      setBoardingStopId(null)
    }
  }

  const handleCancel = async (resId: number) => {
    await cancel(resId)
  }

  if (!vehicle) return null

  const routeShortName = vehicle.route_short_name ?? trip?.route_short_name ?? null
  const routeType = vehicle.route_type ?? trip?.route_type ?? null
  const headsign = vehicle.headsign ?? trip?.headsign ?? null
  const routeColor = getRouteColor(routeType ?? undefined)
  const routeName = routeShortName
    ? `${getRouteLabel(routeType ?? undefined)} ${routeShortName}`
    : 'Vehicle'

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[930] flex justify-center px-0 sm:px-4">
      <section
        className="pointer-events-auto flex w-full flex-col rounded-t-2xl border max-sm:max-w-none"
        style={{
          background: 'var(--surface-elevated)',
          borderColor: 'var(--border)',
          boxShadow: 'var(--shadow-lg)',
          color: 'var(--text)',
          maxHeight: '70vh',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-4 pt-3 pb-2">
          <div className="flex items-center gap-3 min-w-0">
            <span
              className="inline-flex h-9 min-w-14 items-center justify-center rounded-lg px-3 text-lg font-bold text-white"
              style={{ background: routeColor }}
            >
              {routeShortName ?? '?'}
            </span>
            <div className="min-w-0">
              <p className="truncate font-semibold text-lg">{headsign ?? routeName}</p>
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                {vehicle.id}
                {isLocked && (
                  <span
                    className="ml-2 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold"
                    style={{ background: '#3b82f6', color: '#fff' }}
                  >
                    Your ride
                  </span>
                )}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full text-sm"
            style={{ background: 'var(--control-bg)', color: 'var(--text-secondary)' }}
            aria-label="Close"
          >
            x
          </button>
        </div>

        {/* Trip stops */}
        <div className="overflow-y-auto px-4 pb-4 flex-1">
          {loading && <p className="py-3" style={{ color: 'var(--text-muted)' }}>Loading trip...</p>}
          {!loading && error && <p className="py-3" style={{ color: '#ef4444' }}>{error}</p>}
          {!loading && !error && trip && (() => {
            const nonDeparted = trip.stops.filter((s) => s.status !== 'departed')
            const lastZeroIdx = nonDeparted.reduce((acc, s, i) => (s.eta_minutes === 0 ? i : acc), -1)
            const visibleStops = lastZeroIdx > 0 ? nonDeparted.slice(lastZeroIdx) : nonDeparted
            return (
            <div className="relative">
              {visibleStops.map((stop, i, arr) => {
                const isDeparted = stop.status === 'departed'
                const isAtStop = false
                const isBoarding = boardingRes?.stop_id === stop.stop_id
                const isAlighting = alightingRes?.stop_id === stop.stop_id
                const stopReserved = isReserved(vehicle.id, stop.stop_id)
                const canAlight = isLocked && !isDeparted && !isAtStop && !isBoarding && !stopReserved
                const canBoard = !isLocked && !boardingRes && !isDeparted && !isAtStop
                const isReservingThis = reservingStopId === stop.stop_id
                const isBoardingThis = boardingStopId === stop.stop_id
                const isLast = i === arr.length - 1

                const leftBorder = isBoarding
                  ? '#22c55e'
                  : isAlighting
                    ? '#f59e0b'
                    : isAtStop
                      ? '#3b82f6'
                      : 'transparent'

                return (
                  <div key={stop.stop_id + i} className="relative flex gap-3">
                    {/* Timeline dot + line */}
                    <div className="flex flex-col items-center" style={{ width: 20 }}>
                      <div
                        className="rounded-full"
                        style={{
                          width: isAtStop ? 14 : 10,
                          height: isAtStop ? 14 : 10,
                          marginTop: 6,
                          background: isDeparted
                            ? 'var(--text-muted)'
                            : isAtStop
                              ? '#3b82f6'
                              : routeColor,
                          opacity: isDeparted ? 0.3 : 1,
                          transition: 'all 0.3s',
                        }}
                      />
                      {!isLast && (
                        <div
                          className="flex-1"
                          style={{
                            width: 2,
                            minHeight: 32,
                            background: isDeparted ? 'var(--text-muted)' : routeColor,
                            opacity: isDeparted ? 0.3 : 0.5,
                          }}
                        />
                      )}
                    </div>

                    {/* Stop content */}
                    <div
                      className="flex flex-1 items-start justify-between gap-2 pb-3 rounded-lg"
                      style={{
                        borderLeft: `3px solid ${leftBorder}`,
                        paddingLeft: leftBorder !== 'transparent' ? 8 : 0,
                        opacity: isDeparted ? 0.5 : 1,
                      }}
                    >
                      <div className="min-w-0">
                        <p className={`text-sm ${isDeparted ? '' : 'font-semibold'}`}>
                          {stop.stop_name}
                        </p>
                        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                          <StopStatusLabel stop={stop} />
                          {isBoarding && (
                            <span className="ml-1 font-semibold" style={{ color: '#22c55e' }}>
                              · Boarding
                            </span>
                          )}
                          {isAlighting && (
                            <span className="ml-1 font-semibold" style={{ color: '#f59e0b' }}>
                              · Alighting
                            </span>
                          )}
                        </p>
                      </div>

                      {!isDeparted && (
                        <div className="flex items-center gap-2" style={{ flexShrink: 0 }}>
                          {stop.eta_minutes !== null && stop.eta_minutes !== undefined && (
                            <div className="text-right">
                              <p className="text-base font-bold">{stop.eta_minutes}</p>
                              <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>min</p>
                            </div>
                          )}

                          {/* Reserve alight / Board / Cancel / Reserved indicator */}
                          {(isBoarding || isAlighting) ? (
                            <button
                              type="button"
                              onClick={() => handleCancel((isBoarding ? boardingRes : alightingRes)!.id)}
                              className="rounded-lg px-2 py-1 text-xs font-semibold cursor-pointer transition-all"
                              style={{
                                background: 'color-mix(in oklab, var(--control-bg) 80%, #ef4444 20%)',
                                color: '#ef4444',
                              }}
                            >
                              Cancel
                            </button>
                          ) : canAlight ? (
                            <button
                              type="button"
                              disabled={isReservingThis}
                              onClick={() => handleReserveAlight(stop.stop_id)}
                              className="rounded-lg px-2 py-1 text-xs font-semibold cursor-pointer transition-all"
                              style={{ background: routeColor, color: '#fff' }}
                            >
                              {isReservingThis ? '...' : 'Ramp'}
                            </button>
                          ) : canBoard ? (
                            <button
                              type="button"
                              disabled={isBoardingThis}
                              onClick={() => handleReserveBoard(stop.stop_id)}
                              className="rounded-lg px-2 py-1 text-xs font-semibold cursor-pointer transition-all"
                              style={{ background: '#22c55e', color: '#fff' }}
                            >
                              {isBoardingThis ? '...' : 'Board'}
                            </button>
                          ) : null}
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
