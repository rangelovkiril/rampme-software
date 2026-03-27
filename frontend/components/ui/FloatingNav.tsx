"use client";

import { useEffect, useRef, useState } from "react";
import { useRamp, type RampReservation } from "@/contexts/RampContext";
import { getRouteColor } from "@/lib/transit";

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
  const { reservations, lockedVehicleId, cancel } = useRamp();
  const [tripInfo, setTripInfo] = useState<TripInfo | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dragY, setDragY] = useState(0);
  const dragStartY = useRef(0);
  const navRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    if (!lockedVehicleId) {
      setTripInfo(null);
      return;
    }
    const load = async () => {
      try {
        const r = await fetch(
          `/api/realtime/vehicles/${encodeURIComponent(lockedVehicleId)}/trip`,
        );
        if (!r.ok) return;
        const trip = await r.json();
        const stops: TripInfo["stops"] = {};
        for (const s of trip.stops) {
          stops[s.stop_id] = {
            eta_minutes: s.eta_minutes,
            stop_name: s.stop_name,
          };
        }
        setTripInfo({
          route_short_name: trip.route_short_name,
          route_type: trip.route_type,
          stops,
        });
      } catch {}
    };
    load();
    const iv = setInterval(load, 15_000);
    return () => clearInterval(iv);
  }, [lockedVehicleId]);

  return (
    <>
      {/* Nav pill */}
      <div
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
          {/* Reservation banner — always one, pick the more urgent */}
          {hasActive ? (
            (() => {
              const boardEta = boardingRes
                ? (tripInfo?.stops[boardingRes.stop_id]?.eta_minutes ?? null)
                : null;
              const alightEta = alightingRes
                ? (tripInfo?.stops[alightingRes.stop_id]?.eta_minutes ?? null)
                : null;
              // Once boarding stop is at 0 min (vehicle arrived), switch focus to alighting
              const boardDone = boardEta !== null && boardEta <= 0;
              const primary =
                boardingRes && alightingRes
                  ? boardDone
                    ? alightingRes
                    : (boardEta ?? Infinity) <= (alightEta ?? Infinity)
                      ? boardingRes
                      : alightingRes
                  : (boardingRes ?? alightingRes!);
              const primaryType = primary === boardingRes ? "board" : "alight";
              const primaryEta =
                tripInfo?.stops[primary.stop_id]?.eta_minutes ?? null;
              const primaryStop =
                tripInfo?.stops[primary.stop_id]?.stop_name ?? null;
              return (
                <button
                  type="button"
                  onClick={() => { setSheetOpen(true); onReservationsOpen?.() }}
                  className="w-full cursor-pointer"
                  style={{
                    background: "transparent",
                    border: "none",
                    padding: 0,
                  }}
                >
                  <ResBanner
                    type={primaryType}
                    routeName={tripInfo?.route_short_name ?? null}
                    routeType={tripInfo?.route_type ?? null}
                    stopName={primaryStop}
                    eta={primaryEta}
                  />
                </button>
              );
            })()
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
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-[840]"
            style={{ background: "rgba(0,0,0,0.4)" }}
            onClick={() => setSheetOpen(false)}
          />
          {/* Sheet */}
          <div className="fixed inset-x-0 bottom-0 z-[850] flex justify-center px-0 sm:px-4">
            <section
              className="pointer-events-auto w-full rounded-t-2xl border sm:max-w-lg"
              style={{
                background: "var(--surface-elevated)",
                borderColor: "var(--border)",
                boxShadow: "var(--shadow-lg)",
                transform: isDragging && dragY > 0 ? `translateY(${dragY}px)` : undefined,
                transition: isDragging ? "none" : undefined,
              }}
            >
              {/* Drag handle */}
              <div
                className="flex touch-none justify-center pt-2.5 pb-0 sm:hidden"
                onTouchStart={(e) => { dragStartY.current = e.touches[0].clientY; setIsDragging(true); }}
                onTouchMove={(e) => { if (!isDragging) return; const dy = e.touches[0].clientY - dragStartY.current; setDragY(Math.max(0, dy)); }}
                onTouchEnd={() => { setIsDragging(false); if (dragY > 80) { setDragY(0); setSheetOpen(false); } else { setDragY(0); } }}
                onTouchCancel={() => { setIsDragging(false); setDragY(0); }}
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
                {boardingRes && (
                  <ResDetailCard
                    res={boardingRes}
                    meta={tripInfo?.stops[boardingRes.stop_id] ?? null}
                    routeName={tripInfo?.route_short_name ?? null}
                    type="board"
                    onCancel={async (id) => {
                      await cancel(id);
                    }}
                    onOpenVehicle={onOpenVehicle}
                  />
                )}
                {alightingRes && (
                  <ResDetailCard
                    res={alightingRes}
                    meta={tripInfo?.stops[alightingRes.stop_id] ?? null}
                    routeName={tripInfo?.route_short_name ?? null}
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

function ResBanner({
  type,
  routeName,
  routeType,
  stopName,
  eta,
}: {
  type: "board" | "alight";
  routeName: string | null;
  routeType: number | null;
  stopName: string | null;
  eta: number | null;
}) {
  const borderColor = type === "board" ? "#22c55e" : "#f59e0b";
  const label = type === "board" ? "Качване" : "Слизане";
  const transportColor = getRouteColor(routeType);
  return (
    <div
      className="flex w-full min-w-0 items-stretch gap-3 rounded-xl p-3 text-left"
      style={{ border: `2px solid ${borderColor}`, background: "transparent" }}
    >
      {/* Left: route badge + stop name stacked */}
      <div className="flex min-w-0 flex-1 flex-col justify-between gap-1.5">
        <div className="flex items-center gap-2">
          <span
            className="rounded-lg px-2.5 py-1 text-base font-black"
            style={{ background: transportColor, color: "#fff" }}
          >
            {routeName ?? "?"}
          </span>
          <span
            className="text-sm font-semibold"
            style={{ color: "var(--text-secondary)" }}
          >
            {label}
          </span>
        </div>
        {stopName && (
          <p
            className="truncate text-xs font-semibold uppercase tracking-widest"
            style={{ color: "var(--text-muted)" }}
          >
            {stopName}
          </p>
        )}
      </div>

      {/* Right: big ETA box in transport color */}
      {eta !== null && (
        <div
          className="flex flex-shrink-0 flex-col items-center justify-center rounded-lg px-4"
          style={{ minWidth: 72 }}
        >
          <p className="text-4xl font-black leading-none text-white">{eta}</p>
          <p className="mt-0.5 text-xs font-semibold uppercase tracking-wide text-white opacity-80">
            минути
          </p>
        </div>
      )}
    </div>
  );
}

function ResDetailCard({
  res,
  meta,
  routeName,
  type,
  onCancel,
  onOpenVehicle,
}: {
  res: RampReservation;
  meta: StopMeta | null;
  routeName: string | null;
  type: "board" | "alight";
  onCancel: (id: number) => Promise<void>;
  onOpenVehicle?: (vehicleId: string) => void;
}) {
  const typeColor = type === "board" ? "#22c55e" : "#f59e0b";

  return (
    <div
      className="flex items-center gap-3 rounded-2xl px-4 py-3"
      style={{ background: `color-mix(in oklab, ${typeColor} 10%, var(--control-bg) 90%)` }}
    >
      <button
        type="button"
        onClick={() => onOpenVehicle?.(res.vehicle_id)}
        className="flex-shrink-0 rounded-lg px-3 py-1.5 text-lg font-black text-white cursor-pointer"
        style={{ background: typeColor }}
      >
        {routeName ?? "?"}
      </button>
      <span
        className="flex-1 truncate text-sm font-semibold"
        style={{ color: "var(--text-muted)" }}
      >
        {meta?.stop_name ?? ""}
      </span>
      <button
        type="button"
        onClick={() => onCancel(res.id)}
        className="flex-shrink-0 cursor-pointer rounded-lg px-3 py-1 text-sm font-semibold"
        style={{ background: "#ef4444", color: "#fff" }}
      >
        Отказ
      </button>
    </div>
  );
}

function NavBtn({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl py-2 text-sm font-semibold transition-all"
      style={{
        background: active ? "var(--primary)" : "var(--control-bg)",
        color: active ? "#fff" : "var(--text-secondary)",
        border: active ? "none" : "1px solid var(--border)",
      }}
    >
      {children}
      {label}
    </button>
  );
}
