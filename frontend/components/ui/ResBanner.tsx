"use client";

import { getRouteColor } from "@/lib/transit";

interface ResBannerProps {
  type: "board" | "alight";
  routeName: string | null;
  routeType: number | null;
  stopName: string | null;
  eta: number | null;
  status: "departed" | "delay" | "on_time" | "scheduled" | null;
  resStatus: "pending" | "active";
}

export function ResBanner({
  type,
  routeName,
  routeType,
  stopName,
  eta,
  status,
  resStatus,
}: ResBannerProps) {
  const borderColor = type === "board" ? "#22c55e" : "#f59e0b";
  const label = type === "board" ? "Качване" : "Слизане";
  const transportColor = getRouteColor(routeType);
  const isDeparted = status === "departed";
  const isAtStop = resStatus === "active";

  return (
    <div
      className={
        isAtStop
          ? "res-banner-active flex w-full min-w-0 items-stretch gap-3 rounded-xl p-3 text-left"
          : "flex w-full min-w-0 items-stretch gap-3 rounded-xl p-3 text-left"
      }
      style={{
        border: `2px solid ${borderColor}`,
        background: isAtStop
          ? `color-mix(in oklab, ${borderColor} 18%, transparent)`
          : "transparent",
        transition: "background 0.3s",
        ["--res-color" as string]: borderColor,
      }}
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

      {/* Right: boarding-now / ETA — both same visual size */}
      {isAtStop ? (
        <div
          className="flex flex-shrink-0 items-center justify-center px-2"
          style={{ minWidth: 72 }}
        >
          <p
            className="text-base font-black leading-tight text-center whitespace-nowrap"
            style={{ color: "#ffffff" }}
          >
            {type === "board" ? "Качваш се" : "Слизаш сега"}
          </p>
        </div>
      ) : eta !== null ? (
        <div
          className="flex flex-shrink-0 flex-col items-center justify-center px-2"
          style={{ minWidth: 72 }}
        >
          {eta === 0 ? (
            <p
              className="text-base font-black leading-tight text-center"
              style={{ color: "#ffffff" }}
            >
              всеки
              <br />
              момент
            </p>
          ) : (
            <>
              <p
                className="text-4xl font-black leading-none"
                style={{ color: "var(--text)" }}
              >
                {eta}
              </p>
              <p
                className="mt-0.5 text-xs font-semibold uppercase tracking-wide"
                style={{ color: "var(--text-muted)" }}
              >
                минути
              </p>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
