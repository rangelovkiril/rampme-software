"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { Vehicle, TripData, TripEtaUpdate } from "@/lib/types";
import { getRouteColor, getRouteLabel } from "@/lib/transit";
import { useRamp } from "@/contexts/RampContext";
import { useSSE } from "@/hooks/useSSE";
import { apiPath } from "@/lib/config";

function StopStatusLabel({ stop }: { stop: TripData["stops"][number] }) {
  if (stop.status === "departed")
    return (
      <span>Замина{stop.expected_time ? ` ${stop.expected_time}` : ""}</span>
    );
  if (stop.realtime && stop.expected_time) {
    return (
      <span>
        {stop.status === "delay" && (
          <>
            <span style={{ textDecoration: "line-through", opacity: 0.4 }}>
              {stop.scheduled_time}
            </span>{" "}
          </>
        )}
        <span
          style={{ color: stop.status === "delay" ? "#f59e0b" : "#22c55e" }}
        >
          {stop.expected_time}
        </span>
      </span>
    );
  }
  return <span>{stop.scheduled_time ?? ""}</span>;
}

interface Props {
  vehicle: Vehicle | null;
  onClose: () => void;
  onTripLoaded?: (routeId: string | null, routeType: number | null) => void;
  compact?: boolean;
}

// How far below min-height the user must drag to dismiss
const DISMISS_OFFSET = 60;
// Gap between top of sheet and bottom of floating nav
const TOP_GAP = 12;
// Fallback viewport-relative max, if nav measurement fails
const MAX_FALLBACK_RATIO = 0.85;

export default function VehicleTripSheet({
  vehicle,
  onClose,
  onTripLoaded,
  compact = false,
}: Props) {
  const [trip, setTrip] = useState<TripData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reservingStopId, setReservingStopId] = useState<string | null>(null);
  const [boardingStopId, setBoardingStopId] = useState<string | null>(null);
  const isMobile = typeof window !== "undefined" && window.innerWidth < 640;

  const { reserveAlight, reserveBoard, cancel, reservations, lockedVehicleId } =
    useRamp();

  // Refs for height measurement
  const sectionRef = useRef<HTMLElement | null>(null);
  const handleRef = useRef<HTMLDivElement | null>(null);
  const headerRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Measured bounds
  const [minHeight, setMinHeight] = useState(240);
  const [maxHeight, setMaxHeight] = useState(
    typeof window !== "undefined"
      ? window.innerHeight * MAX_FALLBACK_RATIO
      : 600,
  );

  // Current sheet height in px
  const [height, setHeight] = useState(360);

  // Drag state
  const dragging = useRef(false);
  const dragStartY = useRef(0);
  const dragStartHeight = useRef(0);

  // ─── Measure min / max ─────────────────────────────────────────────────
  const measure = useCallback(() => {
    if (typeof window === "undefined") return;

    // Keep same minimum sizing model as stop sheet for visual consistency.
    const handleH = handleRef.current?.offsetHeight ?? 16;
    const headerH = headerRef.current?.offsetHeight ?? 56;
    const computedMin = handleH + headerH + 100;

    // max = distance from bottom of viewport up to bottom of floating nav
    let computedMax = window.innerHeight * MAX_FALLBACK_RATIO;
    const nav = document.querySelector<HTMLElement>("[data-floating-nav]");
    if (nav) {
      const navRect = nav.getBoundingClientRect();
      computedMax = window.innerHeight - navRect.bottom - TOP_GAP;
    }
    if (computedMax < computedMin + 40) computedMax = computedMin + 40;

    setMinHeight(computedMin);
    setMaxHeight(computedMax);
    setHeight((h) => Math.min(Math.max(h, computedMin), computedMax));
  }, []);

  useLayoutEffect(() => {
    measure();
  }, [measure, trip, vehicle]);

  useEffect(() => {
    const onResize = () => measure();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [measure]);

  // Reset height to min when a new vehicle is selected
  useEffect(() => {
    if (!vehicle) return;
    const id = requestAnimationFrame(() => {
      measure();
      setHeight((h) => {
        const target = minHeight + (maxHeight - minHeight) * 0.6;
        return Math.min(Math.max(target, minHeight), maxHeight);
      });
    });
    return () => cancelAnimationFrame(id);
  }, [vehicle, measure, minHeight, maxHeight]);

  const boardingRes = reservations.find(
    (r) =>
      r.vehicle_id === vehicle?.id &&
      r.type === "board" &&
      (r.status === "pending" || r.status === "active"),
  );
  const alightingRes = reservations.find(
    (r) =>
      r.vehicle_id === vehicle?.id &&
      r.type === "alight" &&
      (r.status === "pending" || r.status === "active"),
  );
  const isLocked = lockedVehicleId === vehicle?.id;

  const etaUpdatesRef = useRef<TripEtaUpdate[] | null>(null);
  const onTripLoadedRef = useRef(onTripLoaded);
  useEffect(() => {
    onTripLoadedRef.current = onTripLoaded;
  }, [onTripLoaded]);

  const fetchTrip = useCallback(
    async (vehicleId: string, signal: AbortSignal) => {
      setLoading(true);
      try {
        const r = await fetch(
          apiPath(`/realtime/vehicles/${encodeURIComponent(vehicleId)}/trip`),
          { signal },
        );
        if (signal.aborted) return;
        if (!r.ok) {
          setError("Неуспешно зареждане на маршрут.");
          return;
        }
        const data: TripData = await r.json();
        if (signal.aborted) return;
        const etas = etaUpdatesRef.current;
        if (etas) {
          const map = new Map(etas.map((e) => [e.stop_id, e]));
          setTrip({
            ...data,
            stops: data.stops.map((s) => {
              const u = map.get(s.stop_id);
              return u ? { ...s, ...u } : s;
            }),
          });
        } else {
          setTrip(data);
        }
        setError(null);
        onTripLoadedRef.current?.(
          data.route_id ?? null,
          data.route_type ?? null,
        );
      } catch (e) {
        if ((e as Error)?.name === "AbortError") return;
        setError("Неуспешно зареждане на маршрут.");
      } finally {
        if (!signal.aborted) setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (!vehicle) {
      setTrip(null);
      return;
    }
    setError(null);
    const controller = new AbortController();
    fetchTrip(vehicle.id, controller.signal);
    return () => controller.abort();
  }, [vehicle, fetchTrip]);

  const etaUpdates = useSSE<TripEtaUpdate[]>(
    vehicle
      ? `/realtime/vehicles/${encodeURIComponent(vehicle.id)}/trip/etas`
      : null,
  );

  useEffect(() => {
    etaUpdatesRef.current = etaUpdates;
    if (!etaUpdates) return;
    setTrip((prev) => {
      if (!prev) return prev;
      const map = new Map(etaUpdates.map((e) => [e.stop_id, e]));
      return {
        ...prev,
        stops: prev.stops.map((s) => {
          const u = map.get(s.stop_id);
          return u ? { ...s, ...u } : s;
        }),
      };
    });
  }, [etaUpdates]);

  // ─── Drag handlers (handle bar only) ───────────────────────────────────
  const onTouchStart = (e: React.TouchEvent) => {
    dragging.current = true;
    dragStartY.current = e.touches[0].clientY;
    dragStartHeight.current = height;
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (!dragging.current) return;
    const y = e.touches[0].clientY;
    // Drag up (y decreases) → sheet grows; drag down → shrinks
    const delta = dragStartY.current - y;
    const raw = dragStartHeight.current + delta;

    // Rubber-band outside bounds
    let h = raw;
    if (h > maxHeight) h = maxHeight + (h - maxHeight) * 0.25;
    if (h < minHeight) h = minHeight + (h - minHeight) * 0.6;

    setHeight(h);
  };

  const onTouchEnd = () => {
    if (!dragging.current) return;
    dragging.current = false;

    if (height < minHeight - DISMISS_OFFSET) {
      onClose();
      return;
    }

    // Snap back into valid range; otherwise stay put
    if (height < minHeight) setHeight(minHeight);
    else if (height > maxHeight) setHeight(maxHeight);
  };

  const onTouchCancel = () => {
    dragging.current = false;
    if (height < minHeight) setHeight(minHeight);
    else if (height > maxHeight) setHeight(maxHeight);
  };

  if (!vehicle) return null;

  const routeShortName =
    vehicle.route_short_name ?? trip?.route_short_name ?? null;
  const routeType = vehicle.route_type ?? trip?.route_type ?? null;
  const headsign = vehicle.headsign ?? trip?.headsign ?? null;
  const routeColor = getRouteColor(routeType ?? undefined);
  const routeName = routeShortName
    ? `${getRouteLabel(routeType ?? undefined)} ${routeShortName}`
    : "Превозно средство";

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[930] flex justify-center px-0 sm:px-4">
      <section
        ref={sectionRef}
        className="stop-sheet-shell pointer-events-auto flex w-full flex-col rounded-t-2xl border max-sm:max-w-none"
        style={{
          background: "var(--surface-elevated)",
          borderColor: "var(--border)",
          boxShadow: "var(--shadow-lg)",
          color: "var(--text)",
          height: isMobile ? `${height}px` : undefined,
          maxHeight: isMobile ? `${maxHeight}px` : undefined,
          transition: dragging.current
            ? "none"
            : "height 0.28s cubic-bezier(0.32, 0.72, 0, 1)",
          willChange: "height",
        }}
      >
        {/* Drag handle — mobile only */}
        <div
          ref={handleRef}
          className="flex touch-none justify-center pt-2.5 pb-1 sm:hidden shrink-0"
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          onTouchCancel={onTouchCancel}
          role="presentation"
          style={{ cursor: "grab" }}
        >
          <div
            className="h-1 w-10 rounded-full"
            style={{
              background: "color-mix(in oklab, var(--text) 22%, transparent)",
            }}
          />
        </div>

        {/* Header */}
        <div
          ref={headerRef}
          className="flex items-center justify-between gap-3 px-4 pt-2 pb-2 shrink-0"
        >
          <div className="flex items-center gap-3 min-w-0">
            <span
              className="inline-flex h-9 min-w-14 items-center justify-center rounded-lg px-3 text-lg font-bold text-white"
              style={{ background: routeColor }}
            >
              {routeShortName ?? "—"}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">
                {headsign ?? routeName}
              </p>
              <p
                className="truncate text-xs"
                style={{ color: "var(--text-muted)" }}
              >
                {vehicle.id}
                {isLocked && (
                  <span
                    className="ml-2 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold"
                    style={{ background: "#3b82f6", color: "#fff" }}
                  >
                    Вашето превозно средство
                  </span>
                )}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full text-sm shrink-0"
            style={{
              background: "var(--control-bg)",
              color: "var(--text-secondary)",
            }}
            aria-label="Close"
          >
            x
          </button>
        </div>

        {/* Trip stops — always scrollable, at any height */}
        <div
          ref={scrollRef}
          className={`stop-sheet-scroll overflow-y-auto overflow-x-hidden overscroll-contain px-4 pb-4 ${isMobile ? "min-h-0 flex-1" : ""}`}
          style={isMobile ? { WebkitOverflowScrolling: "touch", maxHeight: "none" } : undefined}
        >
          {loading && (
            <p className="py-3" style={{ color: "var(--text-muted)" }}>
              Зареждане...
            </p>
          )}
          {!loading && error && (
            <p className="py-3" style={{ color: "#ef4444" }}>
              {error}
            </p>
          )}
          {!loading &&
            !error &&
            trip &&
            (() => {
              const nonDeparted = trip.stops.filter(
                (s) => s.status !== "departed",
              );
              const lastZeroIdx = nonDeparted.reduce(
                (acc, s, i) => (s.eta_minutes === 0 ? i : acc),
                -1,
              );
              const visibleStops =
                lastZeroIdx > 0 ? nonDeparted.slice(lastZeroIdx) : nonDeparted;
              const boardingSeq = boardingRes
                ? (trip.stops.find((s) => s.stop_id === boardingRes.stop_id)
                    ?.stop_sequence ?? -1)
                : -1;
              return (
                <div className="relative">
                  {visibleStops.map((stop, i, arr) => {
                    const isDeparted = stop.status === "departed";
                    const isAtStop = false;
                    const isBoarding = boardingRes?.stop_id === stop.stop_id;
                    const isAlighting = alightingRes?.stop_id === stop.stop_id;
                    const isAfterBoarding =
                      boardingSeq >= 0 && stop.stop_sequence > boardingSeq;
                    const canAlight =
                      isLocked &&
                      !alightingRes &&
                      !isDeparted &&
                      !isAtStop &&
                      !isBoarding &&
                      !isAlighting &&
                      isAfterBoarding;
                    const canBoard =
                      !isLocked &&
                      !boardingRes &&
                      !alightingRes &&
                      !isDeparted &&
                      !isAtStop;
                    const isReservingThis = reservingStopId === stop.stop_id;
                    const isBoardingThis = boardingStopId === stop.stop_id;
                    const isLast = i === arr.length - 1;

                    const leftBorder = isBoarding
                      ? "#22c55e"
                      : isAlighting
                        ? "#f59e0b"
                        : isAtStop
                          ? "#3b82f6"
                          : "transparent";

                    return (
                      <div
                        key={stop.stop_id + i}
                        data-stop-row
                        className="relative flex gap-3 pb-3"
                      >
                        <div
                          className="flex flex-col items-center"
                          style={{ width: 20 }}
                        >
                          <div
                            className="rounded-full"
                            style={{
                              width: isAtStop ? 14 : 10,
                              height: isAtStop ? 14 : 10,
                              marginTop: 6,
                              background: isDeparted
                                ? "var(--text-muted)"
                                : isAtStop
                                  ? "#3b82f6"
                                  : routeColor,
                              opacity: isDeparted ? 0.3 : 1,
                              transition: "all 0.3s",
                            }}
                          />
                          {!isLast && (
                            <div
                              className="flex-1"
                              style={{
                                width: 2,
                                minHeight: 32,
                                background: isDeparted
                                  ? "var(--text-muted)"
                                  : routeColor,
                                opacity: isDeparted ? 0.3 : 0.5,
                              }}
                            />
                          )}
                        </div>

                        <div
                          className="flex flex-1 min-w-0 items-start justify-between gap-2 rounded-lg"
                          style={{
                            borderLeft: `3px solid ${leftBorder}`,
                            paddingLeft: leftBorder !== "transparent" ? 8 : 0,
                            opacity: isDeparted ? 0.5 : 1,
                          }}
                        >
                          <div
                            className="min-w-0 flex-1"
                            style={{ lineHeight: 1.15 }}
                          >
                            <div
                              className={`truncate text-sm ${isDeparted ? "" : "font-semibold"}`}
                            >
                              {stop.stop_name}
                            </div>
                            <div
                              className="text-sm whitespace-nowrap"
                              style={{
                                color: "var(--text-muted)",
                                marginTop: 2,
                              }}
                            >
                              <StopStatusLabel stop={stop} />
                            </div>
                            {isBoarding && (
                              <div
                                className="text-sm font-semibold"
                                style={{ color: "#22c55e" }}
                              >
                                Качване
                              </div>
                            )}
                            {isAlighting && (
                              <div
                                className="text-sm font-semibold"
                                style={{ color: "#f59e0b" }}
                              >
                                Слизане
                              </div>
                            )}
                          </div>

                          {!isDeparted && (
                            <div
                              className="flex items-center gap-2"
                              style={{ flexShrink: 0 }}
                            >
                              {stop.eta_minutes !== null &&
                                stop.eta_minutes !== undefined && (
                                  <div className="text-right">
                                    {stop.eta_minutes === 0 ? (
                                      <p
                                        className="text-xs font-bold leading-tight"
                                        style={{ color: "#22c55e" }}
                                      >
                                        всеки
                                        <br />
                                        момент
                                      </p>
                                    ) : (
                                      <>
                                        <p className="text-base font-bold">
                                          {stop.eta_minutes}
                                        </p>
                                        <p
                                          className="text-[10px]"
                                          style={{ color: "var(--text-muted)" }}
                                        >
                                          мин
                                        </p>
                                      </>
                                    )}
                                  </div>
                                )}

                              {isBoarding || isAlighting ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    cancel(
                                      (isBoarding ? boardingRes : alightingRes)!
                                        .id,
                                    )
                                  }
                                  className="rounded-lg px-2 py-1 text-xs font-semibold cursor-pointer transition-all"
                                  style={{
                                    background:
                                      "color-mix(in oklab, var(--control-bg) 80%, #ef4444 20%)",
                                    color: "#ef4444",
                                  }}
                                >
                                  Откажи
                                </button>
                              ) : canAlight ? (
                                <button
                                  type="button"
                                  disabled={isReservingThis}
                                  onClick={async () => {
                                    if (!vehicle || reservingStopId) return;
                                    setReservingStopId(stop.stop_id);
                                    try {
                                      await reserveAlight(
                                        vehicle.id,
                                        stop.stop_id,
                                      );
                                    } finally {
                                      setReservingStopId(null);
                                    }
                                  }}
                                  className="rounded-lg px-2 py-1 text-xs font-semibold cursor-pointer transition-all"
                                  style={{
                                    background: routeColor,
                                    color: "#fff",
                                  }}
                                >
                                  {isReservingThis ? "..." : "Рампа"}
                                </button>
                              ) : canBoard ? (
                                <button
                                  type="button"
                                  disabled={isBoardingThis}
                                  onClick={async () => {
                                    if (!vehicle || boardingStopId) return;
                                    setBoardingStopId(stop.stop_id);
                                    try {
                                      await reserveBoard(
                                        vehicle.id,
                                        stop.stop_id,
                                      );
                                    } finally {
                                      setBoardingStopId(null);
                                    }
                                  }}
                                  className="rounded-lg px-2 py-1 text-xs font-semibold cursor-pointer transition-all"
                                  style={{
                                    background: "#22c55e",
                                    color: "#fff",
                                  }}
                                >
                                  {isBoardingThis ? "..." : "Качване"}
                                </button>
                              ) : null}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
        </div>
      </section>
    </div>
  );
}
