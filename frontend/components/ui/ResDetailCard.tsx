"use client";

import type { RampReservation } from "@/contexts/RampContext";

interface StopMeta {
  eta_minutes: number | null;
  stop_name: string | null;
  status: "departed" | "delay" | "on_time" | "scheduled" | null;
}

interface ResDetailCardProps {
  res: RampReservation;
  meta: StopMeta | null;
  routeName: string | null;
  type: "board" | "alight";
  onCancel: (id: number) => Promise<void>;
  onOpenVehicle?: (vehicleId: string) => void;
}

export function ResDetailCard({
  res,
  meta,
  routeName,
  type,
  onCancel,
  onOpenVehicle,
}: ResDetailCardProps) {
  const typeColor = type === "board" ? "#22c55e" : "#f59e0b";

  return (
    <div
      className="flex items-center gap-3 rounded-2xl px-4 py-3"
      style={{
        background: `color-mix(in oklab, ${typeColor} 10%, var(--control-bg) 90%)`,
      }}
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
