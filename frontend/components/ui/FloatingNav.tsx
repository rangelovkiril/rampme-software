'use client'

import { useEffect, useRef, useState } from 'react'
import { useRamp } from '@/contexts/RampContext'
import { type TripStop, useVehicleTripInfo } from '@/hooks/useVehicleTripInfo'
import { NavButton } from './NavButton'
import { ReservationBanner } from './ReservationBanner'
import { ReservationDetailCard } from './ReservationDetailCard'

interface Props {
  activePanel: string | null
  onTogglePanel: (name: string) => void
  onOpenVehicle?: (vehicleId: string) => void
  onReservationsOpen?: () => void
  closeSignal?: number
}

export default function FloatingNav({
  activePanel,
  onTogglePanel,
  onOpenVehicle,
  onReservationsOpen,
  closeSignal,
}: Props) {
  const { reservations, lockedRouteShortName, cancel } = useRamp()
  const [sheetOpen, setSheetOpen] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [dragY, setDragY] = useState(0)
  const dragStartY = useRef(0)
  const navRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = navRef.current
    if (!el) return
    const update = () =>
      document.documentElement.style.setProperty(
        '--nav-bottom',
        `${el.getBoundingClientRect().bottom + 8}px`,
      )
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const boardingRes = reservations.find(
    (r) => r.type === 'board' && (r.status === 'pending' || r.status === 'active'),
  )
  const alightingRes = reservations.find(
    (r) => r.type === 'alight' && (r.status === 'pending' || r.status === 'active'),
  )
  const hasActive = !!(boardingRes || alightingRes)

  useEffect(() => {
    if (!hasActive) setSheetOpen(false)
  }, [hasActive])

  useEffect(() => {
    if (closeSignal) setSheetOpen(false)
  }, [closeSignal])

  // ── vehicle IDs ──────────────────────────────────────────────────────────
  // Primary: boarding vehicle (if boarding exists), otherwise alighting vehicle
  const primaryVehicleId = boardingRes?.vehicleId ?? alightingRes?.vehicleId ?? null
  // Secondary: alighting vehicle only when it differs from the boarding vehicle
  const secondaryVehicleId =
    boardingRes && alightingRes && boardingRes.vehicleId !== alightingRes.vehicleId
      ? alightingRes.vehicleId
      : null

  // ── trip info: one subscription per vehicle ──────────────────────────────
  const primary = useVehicleTripInfo(primaryVehicleId)
  const secondary = useVehicleTripInfo(secondaryVehicleId)

  // ── stop meta helpers ────────────────────────────────────────────────────
  const getBoardingMeta = (stopId: string): TripStop | null => primary.stopsById[stopId] ?? null

  const getAlightingMeta = (stopId: string): TripStop | null =>
    secondary.trip ? (secondary.stopsById[stopId] ?? null) : (primary.stopsById[stopId] ?? null)

  // Route name for alighting (use secondary info if separate vehicle, else primary)
  const alightingRouteName =
    secondary.trip?.routeShortName ??
    (boardingRes && alightingRes && boardingRes.vehicleId !== alightingRes.vehicleId
      ? null
      : (primary.trip?.routeShortName ?? lockedRouteShortName))

  // ── banner display order ─────────────────────────────────────────────────
  // Active boarding always first; otherwise sort ascending by ETA (null = last)
  const boardingEta = boardingRes ? (getBoardingMeta(boardingRes.stopId)?.etaMinutes ?? null) : null
  const alightingEta = alightingRes
    ? (getAlightingMeta(alightingRes.stopId)?.etaMinutes ?? null)
    : null
  const showAlightingFirst =
    boardingRes &&
    alightingRes &&
    boardingRes.status !== 'active' &&
    alightingEta !== null &&
    (boardingEta === null || alightingEta <= boardingEta)

  return (
    <>
      {/* Nav pill */}
      <div
        data-floating-nav
        className="pointer-events-none fixed left-1/2 z-[800] -translate-x-1/2"
        style={{
          top: 'var(--nav-top-offset)',
          width: 'calc(100vw - 2rem)',
          maxWidth: '380px',
        }}
      >
        <div
          ref={navRef}
          className="pointer-events-auto flex flex-col gap-2 rounded-2xl border p-2 backdrop-blur-xl"
          style={{
            background: 'var(--surface-overlay)',
            boxShadow: 'var(--shadow-lg)',
            borderColor: 'var(--border)',
          }}
        >
          {hasActive ? (
            <div className="flex flex-col gap-1.5">
              {showAlightingFirst && boardingRes && alightingRes ? (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setSheetOpen(true)
                      onReservationsOpen?.()
                    }}
                    className="w-full cursor-pointer"
                    style={{
                      background: 'transparent',
                      border: 'none',
                      padding: 0,
                    }}
                  >
                    <ReservationBanner
                      type="alight"
                      routeName={alightingRouteName}
                      routeType={secondary.trip?.routeType ?? primary.trip?.routeType ?? null}
                      stopName={getAlightingMeta(alightingRes.stopId)?.stopName ?? null}
                      eta={alightingEta}
                      status={getAlightingMeta(alightingRes.stopId)?.status ?? null}
                      resStatus={alightingRes.status as 'pending' | 'active'}
                    />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSheetOpen(true)
                      onReservationsOpen?.()
                    }}
                    className="w-full cursor-pointer"
                    style={{
                      background: 'transparent',
                      border: 'none',
                      padding: 0,
                    }}
                  >
                    <ReservationBanner
                      type="board"
                      routeName={primary.trip?.routeShortName ?? lockedRouteShortName}
                      routeType={primary.trip?.routeType ?? null}
                      stopName={getBoardingMeta(boardingRes.stopId)?.stopName ?? null}
                      eta={boardingEta}
                      status={getBoardingMeta(boardingRes.stopId)?.status ?? null}
                      resStatus={boardingRes.status as 'pending' | 'active'}
                    />
                  </button>
                </>
              ) : (
                <>
                  {boardingRes && (
                    <button
                      type="button"
                      onClick={() => {
                        setSheetOpen(true)
                        onReservationsOpen?.()
                      }}
                      className="w-full cursor-pointer"
                      style={{
                        background: 'transparent',
                        border: 'none',
                        padding: 0,
                      }}
                    >
                      <ReservationBanner
                        type="board"
                        routeName={primary.trip?.routeShortName ?? lockedRouteShortName}
                        routeType={primary.trip?.routeType ?? null}
                        stopName={getBoardingMeta(boardingRes.stopId)?.stopName ?? null}
                        eta={boardingEta}
                        status={getBoardingMeta(boardingRes.stopId)?.status ?? null}
                        resStatus={boardingRes.status as 'pending' | 'active'}
                      />
                    </button>
                  )}
                  {alightingRes && (
                    <button
                      type="button"
                      onClick={() => {
                        setSheetOpen(true)
                        onReservationsOpen?.()
                      }}
                      className="w-full cursor-pointer"
                      style={{
                        background: 'transparent',
                        border: 'none',
                        padding: 0,
                      }}
                    >
                      <ReservationBanner
                        type="alight"
                        routeName={alightingRouteName}
                        routeType={secondary.trip?.routeType ?? primary.trip?.routeType ?? null}
                        stopName={getAlightingMeta(alightingRes.stopId)?.stopName ?? null}
                        eta={alightingEta}
                        status={getAlightingMeta(alightingRes.stopId)?.status ?? null}
                        resStatus={alightingRes.status as 'pending' | 'active'}
                      />
                    </button>
                  )}
                </>
              )}
            </div>
          ) : (
            <div
              className="rounded-xl px-4 py-3 text-sm font-medium text-center"
              style={{
                background: 'var(--control-bg)',
                color: 'var(--text-muted)',
              }}
            >
              Резервирайте рампа от картата
            </div>
          )}

          {/* Nav buttons */}
          <div className="flex gap-2">
            <NavButton
              active={activePanel === 'routes'}
              onClick={() => onTogglePanel('routes')}
              label="Линии"
            >
              <svg
                aria-hidden="true"
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="6" cy="19" r="3" />
                <circle cx="18" cy="5" r="3" />
                <path d="M12 19h4.5a3.5 3.5 0 0 0 0-7h-9a3.5 3.5 0 0 1 0-7H18" />
              </svg>
            </NavButton>
            <NavButton
              active={activePanel === 'stops'}
              onClick={() => onTogglePanel('stops')}
              label="Спирки"
            >
              <svg
                aria-hidden="true"
                width="15"
                height="15"
                viewBox="0 0 24 36"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="2" y="4" width="20" height="12" rx="2" />
                <line x1="12" y1="16" x2="12" y2="36" />
              </svg>
            </NavButton>
          </div>
        </div>
      </div>

      {/* Reservations detail sheet */}
      {sheetOpen && (
        <>
          <button
            type="button"
            aria-label="Затвори"
            className="fixed inset-0 z-[840] cursor-default"
            style={{ background: 'rgba(0,0,0,0.4)', border: 'none' }}
            onClick={() => setSheetOpen(false)}
          />
          <div className="fixed inset-x-0 bottom-0 z-[850] flex justify-center px-0 sm:px-4">
            <section
              className="pointer-events-auto w-full rounded-t-2xl border sm:max-w-lg"
              style={{
                background: 'var(--surface-elevated)',
                borderColor: 'var(--border)',
                boxShadow: 'var(--shadow-lg)',
                transform: isDragging && dragY > 0 ? `translateY(${dragY}px)` : undefined,
                transition: isDragging ? 'none' : undefined,
              }}
            >
              <div
                className="flex touch-none justify-center pt-2.5 pb-0 sm:hidden"
                onTouchStart={(e) => {
                  dragStartY.current = e.touches[0].clientY
                  setIsDragging(true)
                }}
                onTouchMove={(e) => {
                  if (!isDragging) return
                  const dy = e.touches[0].clientY - dragStartY.current
                  setDragY(Math.max(0, dy))
                }}
                onTouchEnd={() => {
                  setIsDragging(false)
                  if (dragY > 80) {
                    setDragY(0)
                    setSheetOpen(false)
                  } else {
                    setDragY(0)
                  }
                }}
                onTouchCancel={() => {
                  setIsDragging(false)
                  setDragY(0)
                }}
                role="presentation"
              >
                <div
                  className="h-1 w-10 rounded-full"
                  style={{
                    background: 'color-mix(in oklab, var(--text) 20%, transparent)',
                  }}
                />
              </div>

              <div className="flex flex-col gap-3 px-4 pb-5 pt-2">
                {showAlightingFirst && alightingRes && (
                  <ReservationDetailCard
                    res={alightingRes}
                    meta={getAlightingMeta(alightingRes.stopId)}
                    routeName={alightingRouteName}
                    type="alight"
                    onCancel={async (id) => {
                      await cancel(id)
                    }}
                    onOpenVehicle={onOpenVehicle}
                  />
                )}
                {boardingRes && (
                  <ReservationDetailCard
                    res={boardingRes}
                    meta={getBoardingMeta(boardingRes.stopId)}
                    routeName={primary.trip?.routeShortName ?? null}
                    type="board"
                    onCancel={async (id) => {
                      await cancel(id)
                      if (
                        alightingRes &&
                        boardingRes.status !== 'active' &&
                        boardingRes.vehicleId === alightingRes.vehicleId
                      ) {
                        await cancel(alightingRes.id)
                      }
                    }}
                    onOpenVehicle={onOpenVehicle}
                  />
                )}
                {!showAlightingFirst && alightingRes && (
                  <ReservationDetailCard
                    res={alightingRes}
                    meta={getAlightingMeta(alightingRes.stopId)}
                    routeName={alightingRouteName}
                    type="alight"
                    onCancel={async (id) => {
                      await cancel(id)
                    }}
                    onOpenVehicle={onOpenVehicle}
                  />
                )}

                <button
                  type="button"
                  onClick={() => setSheetOpen(false)}
                  className="mt-1 w-full cursor-pointer rounded-2xl py-3.5 text-base font-semibold text-white transition-opacity active:opacity-80"
                  style={{ background: 'var(--primary)' }}
                >
                  + Нова резервация
                </button>
              </div>
            </section>
          </div>
        </>
      )}
    </>
  )
}
