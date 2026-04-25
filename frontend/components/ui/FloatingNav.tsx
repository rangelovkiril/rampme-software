"use client";

import { useEffect, useRef, useState } from "react";
import { useRamp } from "@/contexts/RampContext";
import { useSSE } from "@/hooks/useSSE";
import type { TripEtaUpdate } from "@/lib/types";
import { NavBtn } from "./NavBtn";
import { ResBanner } from "./ResBanner";
import { ResDetailCard } from "./ResDetailCard";

interface Props {
  activePanel: string | null;
  onTogglePanel: (name: string) => void;
  onOpenVehicle?: (vehicleId: string) => void;
  onReservationsOpen?: () => void;
  closeSignal?: number;
}

interface StopMeta {
  eta_minutes: number | null;
  stop_name: string | null;
  status: "departed" | "delay" | "on_time" | "scheduled" | null;
}

interface TripInfo {
  route_short_name: string | null;
  route_type: number | null;
  stops: Record<string, StopMeta>;
}

export default function FloatingNav({
  activePanel,
  onTogglePanel,
  onOpenVehicle,
  onReservationsOpen,
  closeSignal,
}: Props) {
  const { reservations, lockedVehicleId, lockedRouteShortName, cancel } =
    useRamp();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dragY, setDragY] = useState(0);
  const dragStartY = useRef(0);
  const navRef = useRef<HTMLDivElement>(null);

  // ── trip info state: one per vehicle ────────────────────────────────────
  const [primaryTripInfo, setPrimaryTripInfo] = useState<TripInfo | null>(null);
  const [secondaryTripInfo, setSecondaryTripInfo] = useState<TripInfo | null>(
    null,
  );
  const primaryEtaRef = useRef<TripEtaUpdate[] | null>(null);
  const secondaryEtaRef = useRef<TripEtaUpdate[] | null>(null);

  useEffect(() => {
    const el = navRef.current;
    if (!el) return;
    const update = () =>
      document.documentElement.style.setProperty(
        "--nav-bottom",
        `${el.getBoundingClientRect().bottom + 8}px`,
      );
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const boardingRes = reservations.find(
    (r) =>
      r.type === "board" && (r.status === "pending" || r.status === "active"),
  );
  const alightingRes = reservations.find(
    (r) =>
      r.type === "alight" && (r.status === "pending" || r.status === "active"),
  );
  const hasActive = !!(boardingRes || alightingRes);

  useEffect(() => {
    if (!hasActive) setSheetOpen(false);
  }, [hasActive]);

  useEffect(() => {
    if (closeSignal) setSheetOpen(false);
  }, [closeSignal]);

  // ── vehicle IDs ──────────────────────────────────────────────────────────
  // Primary: boarding vehicle (if boarding exists), otherwise alighting vehicle
  const primaryVehicleId =
    boardingRes?.vehicle_id ?? alightingRes?.vehicle_id ?? null;
  // Secondary: alighting vehicle only when it differs from the boarding vehicle
  const secondaryVehicleId =
    boardingRes &&
    alightingRes &&
    boardingRes.vehicle_id !== alightingRes.vehicle_id
      ? alightingRes.vehicle_id
      : null;

  // ── fetch static trip structure for primary vehicle ──────────────────────
  useEffect(() => {
    if (!primaryVehicleId) {
      setPrimaryTripInfo(null);
      return;
    }
    fetch(`/api/realtime/vehicles/${encodeURIComponent(primaryVehicleId)}/trip`)
      .then((r) => (r.ok ? r.json() : null))
      .then((trip) => {
        if (!trip) return;
        const stops: TripInfo["stops"] = {};
        for (const s of trip.stops)
          stops[s.stop_id] = {
            eta_minutes: s.eta_minutes,
            stop_name: s.stop_name,
            status: s.status ?? null,
          };
        const base: TripInfo = {
          route_short_name: trip.route_short_name,
          route_type: trip.route_type,
          stops,
        };
        const etas = primaryEtaRef.current;
        if (etas) {
          const newStops = { ...base.stops };
          for (const e of etas) {
            if (newStops[e.stop_id])
              newStops[e.stop_id] = {
                ...newStops[e.stop_id],
                eta_minutes: e.eta_minutes,
                status: e.status,
              };
          }
          setPrimaryTripInfo({ ...base, stops: newStops });
        } else {
          setPrimaryTripInfo(base);
        }
      })
      .catch(() => {});
  }, [primaryVehicleId]);

  // ── fetch static trip structure for secondary vehicle ────────────────────
  useEffect(() => {
    if (!secondaryVehicleId) {
      setSecondaryTripInfo(null);
      return;
    }
    fetch(
      `/api/realtime/vehicles/${encodeURIComponent(secondaryVehicleId)}/trip`,
    )
      .then((r) => (r.ok ? r.json() : null))
      .then((trip) => {
        if (!trip) return;
        const stops: TripInfo["stops"] = {};
        for (const s of trip.stops)
          stops[s.stop_id] = {
            eta_minutes: s.eta_minutes,
            stop_name: s.stop_name,
            status: s.status ?? null,
          };
        const base: TripInfo = {
          route_short_name: trip.route_short_name,
          route_type: trip.route_type,
          stops,
        };
        const etas = secondaryEtaRef.current;
        if (etas) {
          const newStops = { ...base.stops };
          for (const e of etas) {
            if (newStops[e.stop_id])
              newStops[e.stop_id] = {
                ...newStops[e.stop_id],
                eta_minutes: e.eta_minutes,
                status: e.status,
              };
          }
          setSecondaryTripInfo({ ...base, stops: newStops });
        } else {
          setSecondaryTripInfo(base);
        }
      })
      .catch(() => {});
  }, [secondaryVehicleId]);

  // ── SSE ETA updates for primary vehicle ─────────────────────────────────
  const primaryEtaUpdates = useSSE<TripEtaUpdate[]>(
    primaryVehicleId
      ? `/realtime/vehicles/${encodeURIComponent(primaryVehicleId)}/trip/etas`
      : null,
  );

  useEffect(() => {
    primaryEtaRef.current = primaryEtaUpdates;
    if (!primaryEtaUpdates) return;
    setPrimaryTripInfo((prev) => {
      if (!prev) return prev;
      const newStops = { ...prev.stops };
      for (const e of primaryEtaUpdates) {
        if (newStops[e.stop_id])
          newStops[e.stop_id] = {
            ...newStops[e.stop_id],
            eta_minutes: e.eta_minutes,
            status: e.status,
          };
      }
      return { ...prev, stops: newStops };
    });
  }, [primaryEtaUpdates]);

  // ── SSE ETA updates for secondary vehicle ────────────────────────────────
  const secondaryEtaUpdates = useSSE<TripEtaUpdate[]>(
    secondaryVehicleId
      ? `/realtime/vehicles/${encodeURIComponent(secondaryVehicleId)}/trip/etas`
      : null,
  );

  useEffect(() => {
    secondaryEtaRef.current = secondaryEtaUpdates;
    if (!secondaryEtaUpdates) return;
    setSecondaryTripInfo((prev) => {
      if (!prev) return prev;
      const newStops = { ...prev.stops };
      for (const e of secondaryEtaUpdates) {
        if (newStops[e.stop_id])
          newStops[e.stop_id] = {
            ...newStops[e.stop_id],
            eta_minutes: e.eta_minutes,
            status: e.status,
          };
      }
      return { ...prev, stops: newStops };
    });
  }, [secondaryEtaUpdates]);

  // ── stop meta helpers ────────────────────────────────────────────────────
  const getBoardingMeta = (stopId: string): StopMeta | null =>
    primaryTripInfo?.stops[stopId] ?? null;

  const getAlightingMeta = (stopId: string): StopMeta | null =>
    secondaryTripInfo
      ? (secondaryTripInfo.stops[stopId] ?? null)
      : (primaryTripInfo?.stops[stopId] ?? null);

  // Route name for alighting (use secondary info if separate vehicle, else primary)
  const alightingRouteName =
    secondaryTripInfo?.route_short_name ??
    (boardingRes &&
    alightingRes &&
    boardingRes.vehicle_id !== alightingRes.vehicle_id
      ? null
      : (primaryTripInfo?.route_short_name ?? lockedRouteShortName));

  // ── banner display order ─────────────────────────────────────────────────
  // Active boarding always first; otherwise sort ascending by ETA (null = last)
  const boardingEta = boardingRes
    ? (getBoardingMeta(boardingRes.stop_id)?.eta_minutes ?? null)
    : null;
  const alightingEta = alightingRes
    ? (getAlightingMeta(alightingRes.stop_id)?.eta_minutes ?? null)
    : null;
  const showAlightingFirst =
    boardingRes &&
    alightingRes &&
    boardingRes.status !== "active" &&
    alightingEta !== null &&
    (boardingEta === null || alightingEta <= boardingEta);

  return (
    <>
      {/* Nav pill */}
      <div
        data-floating-nav
        className="pointer-events-none fixed left-1/2 z-[800] -translate-x-1/2"
        style={{
          top: "var(--nav-top-offset)",
          width: "calc(100vw - 2rem)",
          maxWidth: "380px",
        }}
      >
        <div
          ref={navRef}
          className="pointer-events-auto flex flex-col gap-2 rounded-2xl border p-2 backdrop-blur-xl"
          style={{
            background: "var(--surface-overlay)",
            boxShadow: "var(--shadow-lg)",
            borderColor: "var(--border)",
          }}
        >
          {hasActive ? (
            <div className="flex flex-col gap-1.5">
              {showAlightingFirst ? (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setSheetOpen(true);
                      onReservationsOpen?.();
                    }}
                    className="w-full cursor-pointer"
                    style={{
                      background: "transparent",
                      border: "none",
                      padding: 0,
                    }}
                  >
                    <ResBanner
                      type="alight"
                      routeName={alightingRouteName}
                      routeType={
                        secondaryTripInfo?.route_type ??
                        primaryTripInfo?.route_type ??
                        null
                      }
                      stopName={
                        getAlightingMeta(alightingRes!.stop_id)?.stop_name ??
                        null
                      }
                      eta={alightingEta}
                      status={
                        getAlightingMeta(alightingRes!.stop_id)?.status ?? null
                      }
                      resStatus={alightingRes!.status as "pending" | "active"}
                    />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSheetOpen(true);
                      onReservationsOpen?.();
                    }}
                    className="w-full cursor-pointer"
                    style={{
                      background: "transparent",
                      border: "none",
                      padding: 0,
                    }}
                  >
                    <ResBanner
                      type="board"
                      routeName={
                        primaryTripInfo?.route_short_name ??
                        lockedRouteShortName
                      }
                      routeType={primaryTripInfo?.route_type ?? null}
                      stopName={
                        getBoardingMeta(boardingRes!.stop_id)?.stop_name ?? null
                      }
                      eta={boardingEta}
                      status={
                        getBoardingMeta(boardingRes!.stop_id)?.status ?? null
                      }
                      resStatus={boardingRes!.status as "pending" | "active"}
                    />
                  </button>
                </>
              ) : (
                <>
                  {boardingRes && (
                    <button
                      type="button"
                      onClick={() => {
                        setSheetOpen(true);
                        onReservationsOpen?.();
                      }}
                      className="w-full cursor-pointer"
                      style={{
                        background: "transparent",
                        border: "none",
                        padding: 0,
                      }}
                    >
                      <ResBanner
                        type="board"
                        routeName={
                          primaryTripInfo?.route_short_name ??
                          lockedRouteShortName
                        }
                        routeType={primaryTripInfo?.route_type ?? null}
                        stopName={
                          getBoardingMeta(boardingRes.stop_id)?.stop_name ??
                          null
                        }
                        eta={boardingEta}
                        status={
                          getBoardingMeta(boardingRes.stop_id)?.status ?? null
                        }
                        resStatus={boardingRes.status as "pending" | "active"}
                      />
                    </button>
                  )}
                  {alightingRes && (
                    <button
                      type="button"
                      onClick={() => {
                        setSheetOpen(true);
                        onReservationsOpen?.();
                      }}
                      className="w-full cursor-pointer"
                      style={{
                        background: "transparent",
                        border: "none",
                        padding: 0,
                      }}
                    >
                      <ResBanner
                        type="alight"
                        routeName={alightingRouteName}
                        routeType={
                          secondaryTripInfo?.route_type ??
                          primaryTripInfo?.route_type ??
                          null
                        }
                        stopName={
                          getAlightingMeta(alightingRes.stop_id)?.stop_name ??
                          null
                        }
                        eta={alightingEta}
                        status={
                          getAlightingMeta(alightingRes.stop_id)?.status ?? null
                        }
                        resStatus={alightingRes.status as "pending" | "active"}
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
                background: "var(--control-bg)",
                color: "var(--text-muted)",
              }}
            >
              Резервирайте рампа от картата
            </div>
          )}

          {/* Nav buttons */}
          <div className="flex gap-2">
            <NavBtn
              active={activePanel === "routes"}
              onClick={() => onTogglePanel("routes")}
              label="Линии"
            >
              <svg
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
            </NavBtn>
            <NavBtn
              active={activePanel === "stops"}
              onClick={() => onTogglePanel("stops")}
              label="Спирки"
            >
              <svg
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
            </NavBtn>
          </div>
        </div>
      </div>

      {/* Reservations detail sheet */}
      {sheetOpen && (
        <>
          <div
            className="fixed inset-0 z-[840]"
            style={{ background: "rgba(0,0,0,0.4)" }}
            onClick={() => setSheetOpen(false)}
          />
          <div className="fixed inset-x-0 bottom-0 z-[850] flex justify-center px-0 sm:px-4">
            <section
              className="pointer-events-auto w-full rounded-t-2xl border sm:max-w-lg"
              style={{
                background: "var(--surface-elevated)",
                borderColor: "var(--border)",
                boxShadow: "var(--shadow-lg)",
                transform:
                  isDragging && dragY > 0
                    ? `translateY(${dragY}px)`
                    : undefined,
                transition: isDragging ? "none" : undefined,
              }}
            >
              <div
                className="flex touch-none justify-center pt-2.5 pb-0 sm:hidden"
                onTouchStart={(e) => {
                  dragStartY.current = e.touches[0].clientY;
                  setIsDragging(true);
                }}
                onTouchMove={(e) => {
                  if (!isDragging) return;
                  const dy = e.touches[0].clientY - dragStartY.current;
                  setDragY(Math.max(0, dy));
                }}
                onTouchEnd={() => {
                  setIsDragging(false);
                  if (dragY > 80) {
                    setDragY(0);
                    setSheetOpen(false);
                  } else {
                    setDragY(0);
                  }
                }}
                onTouchCancel={() => {
                  setIsDragging(false);
                  setDragY(0);
                }}
                role="presentation"
              >
                <div
                  className="h-1 w-10 rounded-full"
                  style={{
                    background:
                      "color-mix(in oklab, var(--text) 20%, transparent)",
                  }}
                />
              </div>

              <div className="flex flex-col gap-3 px-4 pb-5 pt-2">
                {showAlightingFirst && alightingRes && (
                  <ResDetailCard
                    res={alightingRes}
                    meta={getAlightingMeta(alightingRes.stop_id)}
                    routeName={alightingRouteName}
                    type="alight"
                    onCancel={async (id) => {
                      await cancel(id);
                    }}
                    onOpenVehicle={onOpenVehicle}
                  />
                )}
                {boardingRes && (
                  <ResDetailCard
                    res={boardingRes}
                    meta={getBoardingMeta(boardingRes.stop_id)}
                    routeName={primaryTripInfo?.route_short_name ?? null}
                    type="board"
                    onCancel={async (id) => {
                      await cancel(id);
                      if (
                        alightingRes &&
                        boardingRes.status !== "active" &&
                        boardingRes.vehicle_id === alightingRes.vehicle_id
                      ) {
                        await cancel(alightingRes.id);
                      }
                    }}
                    onOpenVehicle={onOpenVehicle}
                  />
                )}
                {!showAlightingFirst && alightingRes && (
                  <ResDetailCard
                    res={alightingRes}
                    meta={getAlightingMeta(alightingRes.stop_id)}
                    routeName={alightingRouteName}
                    type="alight"
                    onCancel={async (id) => {
                      await cancel(id);
                    }}
                    onOpenVehicle={onOpenVehicle}
                  />
                )}

                <button
                  type="button"
                  onClick={() => setSheetOpen(false)}
                  className="mt-1 w-full cursor-pointer rounded-2xl py-3.5 text-base font-semibold text-white transition-opacity active:opacity-80"
                  style={{ background: "var(--primary)" }}
                >
                  + Нова резервация
                </button>
              </div>
            </section>
          </div>
        </>
      )}
    </>
  );
}

