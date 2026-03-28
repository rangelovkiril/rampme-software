"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Stop, StopArrival } from "@/lib/types";
import { getRouteColor, formatEta } from "@/lib/transit";
import { useRamp } from "@/contexts/RampContext";

const POLL_INTERVAL = 15_000;
const MOBILE_SHEET_MAX_VH = 85;
const RAMP_PROXIMITY_METERS = 10;

interface Props {
  stop: Stop | null;
  onClose: () => void;
  onVehicleLock?: (vehicleId: string) => void;
}

export default function StopArrivalsSheet({
  stop,
  onClose,
  onVehicleLock,
}: Props) {
  const [arrivals, setArrivals] = useState<StopArrival[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rampOnly, setRampOnly] = useState(false);
  const [reservingId, setReservingId] = useState<string | null>(null);
  const [reserveError, setReserveError] = useState<string | null>(null);

  const [isOpen, setIsOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [mobileHeightVh, setMobileHeightVh] = useState(50);
  const dragStartY = useRef(0);
  const dragStartVh = useRef(50);
  const isMobile = typeof window !== "undefined" && window.innerWidth < 640;

  const { reserveBoard, isReserved } = useRamp();

  const isNearStop = true;

  const fetchArrivals = useCallback(
    async (stopId: string, initial: boolean) => {
      if (initial) setLoading(true);
      try {
        const r = await fetch(
          `/api/stops/${encodeURIComponent(stopId)}/vehicles?limit=20`,
        );
        if (!r.ok) {
          if (initial) setError("Failed to load arrivals");
          return;
        }
        const data = await r.json();
        setArrivals(data);
        setError(null);
      } catch {
        if (initial) setError("Failed to load arrivals");
      } finally {
        if (initial) setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (!stop) {
      setIsOpen(false);
      return;
    }
    setIsOpen(true);
    setArrivals([]);
    setError(null);
    setRampOnly(false);
    setReserveError(null);
    fetchArrivals(stop.stop_id, true);
    const iv = setInterval(
      () => fetchArrivals(stop.stop_id, false),
      POLL_INTERVAL,
    );
    return () => clearInterval(iv);
  }, [stop, fetchArrivals]);

  const sortedArrivals = useMemo(() => {
    const list = rampOnly ? arrivals.filter((a) => a.has_ramp) : arrivals;
    return [...list].sort((a, b) => {
      if (a.has_ramp && !b.has_ramp) return -1;
      if (!a.has_ramp && b.has_ramp) return 1;
      return a.eta_minutes - b.eta_minutes;
    });
  }, [arrivals, rampOnly]);

  const rampCount = arrivals.filter((a) => a.has_ramp).length;

  const handleDragStart = (e: React.TouchEvent) => {
    setIsDragging(true);
    dragStartY.current = e.touches[0].clientY;
    dragStartVh.current = mobileHeightVh;
  };
  const handleDragMove = (e: React.TouchEvent) => {
    if (!isDragging) return;
    const dy = dragStartY.current - e.touches[0].clientY;
    const dvh = (dy / window.innerHeight) * 100;
    setMobileHeightVh(
      Math.min(MOBILE_SHEET_MAX_VH, Math.max(30, dragStartVh.current + dvh)),
    );
  };
  const handleDragEnd = () => {
    setIsDragging(false);
    if (mobileHeightVh < 35) {
      setIsOpen(false);
      onClose();
    }
  };

  const handleReserve = async (vehicleId: string) => {
    if (!stop || reservingId) return;
    setReservingId(vehicleId);
    setReserveError(null);
    try {
      const routeShortName = arrivals.find((a) => a.vehicle_id === vehicleId)?.route_short_name ?? null;
      const res = await reserveBoard(vehicleId, stop.stop_id, routeShortName);
      if (res) {
        if (onVehicleLock) onVehicleLock(vehicleId);
      } else {
        setReserveError("Could not reserve — try again.");
      }
    } finally {
      setReservingId(null);
    }
  };

  if (!stop) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[920] flex justify-center px-0 sm:px-4">
      <section
        className={`stop-sheet-shell pointer-events-auto flex w-full flex-col rounded-t-2xl border transition-transform ease-out max-sm:max-w-none ${
          isDragging ? "duration-0" : "duration-300"
        } ${isOpen ? "translate-y-0" : "translate-y-full"}`}
        style={{
          background: "var(--surface-elevated)",
          borderColor: "var(--border)",
          boxShadow: "var(--shadow-lg)",
          color: "var(--text)",
          height: isMobile && isOpen ? `${mobileHeightVh}vh` : undefined,
          maxHeight:
            isMobile && isOpen ? `${MOBILE_SHEET_MAX_VH}vh` : undefined,
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
              background: "color-mix(in oklab, var(--text) 24%, transparent)",
            }}
          />
        </div>

        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-4 pt-1 pb-3">
          <div className="min-w-0">
            <p className="stop-sheet-title truncate font-semibold">
              {stop.stop_name}
            </p>
            <p
              className="stop-sheet-text"
              style={{ color: "var(--text-secondary)" }}
            >
              {stop.stop_id}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setRampOnly((v) => !v)}
              className="stop-sheet-action flex items-center gap-1.5 rounded-full px-3 text-sm font-semibold transition-all"
              style={{
                background: rampOnly ? "#3b82f6" : "var(--control-bg)",
                color: rampOnly ? "#fff" : "var(--text-secondary)",
                border: rampOnly ? "none" : "1px solid var(--border)",
              }}
              title={
                rampOnly ? "Show all vehicles" : "Show only vehicles with ramp"
              }
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="10" cy="17.5" r="3.5" />
                <path
                  d="M18 4a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z"
                  fill="currentColor"
                  stroke="none"
                />
                <path d="M17 7l-5 5" />
                <path d="M12 12l-5 5" />
                <path d="M17 7v6" />
              </svg>
              {rampOnly ? `Ramp (${rampCount})` : "Ramp"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="stop-sheet-action flex h-10 w-10 cursor-pointer items-center justify-center rounded-full text-sm"
              style={{
                background: "var(--control-bg)",
                color: "var(--text-secondary)",
              }}
              aria-label="Close"
            >
              x
            </button>
          </div>
        </div>

        {/* Arrivals */}
        <div
          className={`stop-sheet-scroll overflow-y-auto px-3 pb-4 ${isMobile && isOpen ? "min-h-0 flex-1" : ""}`}
          style={isMobile && isOpen ? { maxHeight: "none" } : undefined}
        >
          {reserveError && (
            <p className="px-2 py-2 text-sm font-medium" style={{ color: "#ef4444" }}>
              {reserveError}
            </p>
          )}
          {loading && (
            <p className="px-2 py-3" style={{ color: "var(--text-muted)" }}>
              Loading...
            </p>
          )}
          {!loading && error && (
            <p className="px-2 py-3" style={{ color: "#ef4444" }}>
              {error}
            </p>
          )}
          {!loading && !error && sortedArrivals.length === 0 && (
            <p className="px-2 py-3" style={{ color: "var(--text-muted)" }}>
              {rampOnly
                ? "No ramp-equipped vehicles right now."
                : "No active vehicles right now."}
            </p>
          )}
          {!loading && !error && sortedArrivals.length > 0 && (
            <div className="space-y-2">
              {sortedArrivals.map((item) => {
                const routeColor = getRouteColor(item.route_type);
                const scheduled = item.scheduled_time ?? null;
                const expected = item.expected_time ?? null;
                const isDelayed =
                  item.realtime &&
                  scheduled &&
                  expected &&
                  expected !== scheduled;
                const vehicleId = item.vehicle_id;
                const canRequest = isNearStop && Boolean(vehicleId);
                const reserved = vehicleId
                  ? isReserved(vehicleId, stop.stop_id)
                  : false;
                const isReserving = reservingId === vehicleId;

                return (
                  <div
                    key={item.id}
                    className="flex items-center justify-between gap-4 rounded-xl border px-4 py-3"
                    style={{
                      borderColor: reserved ? "#3b82f6" : "var(--border)",
                      background: reserved
                        ? "color-mix(in oklab, #3b82f6 12%, var(--surface-elevated) 88%)"
                        : "color-mix(in oklab, var(--surface-elevated) 85%, var(--text) 5%)",
                    }}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span
                        className="inline-flex h-8 min-w-12 items-center justify-center rounded-md px-2.5 text-base font-bold text-white"
                        style={{ background: routeColor }}
                      >
                        {item.route_short_name ?? "?"}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-lg font-semibold">
                          {item.headsign ?? "Route"}
                        </p>
                        <p
                          className="text-base font-medium"
                          style={{ color: "var(--text-secondary)" }}
                        >
                          {item.realtime ? (
                            <span style={{ color: "#22c55e" }}>Live</span>
                          ) : (
                            <span>Scheduled</span>
                          )}
                          {isDelayed ? (
                            <>
                              {" · "}
                              <span
                                style={{
                                  textDecoration: "line-through",
                                  opacity: 0.5,
                                }}
                              >
                                {scheduled}
                              </span>{" "}
                              <span style={{ color: "#f59e0b" }}>
                                {expected}
                              </span>
                            </>
                          ) : scheduled ? (
                            ` · ${scheduled}`
                          ) : (
                            ""
                          )}
                        </p>
                        {vehicleId && (
                          <p
                            className="text-xs"
                            style={{ color: "var(--text-muted)" }}
                          >
                            ID: {vehicleId}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span
                        className="text-xl font-bold whitespace-nowrap"
                        style={{
                          color: item.realtime
                            ? "#22c55e"
                            : "var(--text-secondary)",
                        }}
                      >
                        {formatEta(item.eta_minutes)}
                      </span>

                      {/* Ramp button — inline state, no alert */}
                      <button
                        type="button"
                        disabled={!canRequest || reserved || isReserving}
                        onClick={() => vehicleId && handleReserve(vehicleId)}
                        className="stop-sheet-action h-10 rounded-lg px-3 py-1 text-base font-semibold transition-all"
                        style={{
                          background: reserved
                            ? "#22c55e"
                            : isReserving
                              ? "#6b7280"
                              : canRequest
                                ? routeColor
                                : "color-mix(in oklab, var(--control-bg) 88%, var(--text) 6%)",
                          color:
                            canRequest || reserved
                              ? "#fff"
                              : "var(--text-muted)",
                          border:
                            canRequest || reserved
                              ? "none"
                              : "1px solid var(--border)",
                          opacity: canRequest || reserved ? 1 : 0.5,
                          cursor:
                            canRequest && !reserved && !isReserving
                              ? "pointer"
                              : "not-allowed",
                        }}
                        title={
                          reserved
                            ? "Boarding reserved"
                            : canRequest
                              ? "Reserve ramp to board"
                              : vehicleId
                                ? `Come within ${RAMP_PROXIMITY_METERS}m of the stop`
                                : "Live vehicle id unavailable"
                        }
                      >
                        {reserved
                          ? "Reserved"
                          : isReserving
                            ? "..."
                            : canRequest
                              ? "Board"
                              : vehicleId
                                ? "Board"
                                : "No ID"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
