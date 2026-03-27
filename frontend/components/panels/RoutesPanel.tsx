"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Route } from "@/lib/types";
import { ROUTE_TYPE_CONFIG, ROUTE_TYPE_ORDER } from "@/lib/transit";
import FilterChip from "./FilterChip";

interface RoutesPanelProps {
  onSelectRoute?: (routeId: string, routeType: number) => void;
  onClose: () => void;
}

const TYPE_ORDER_INDICES = new Map<number, number>(
  ROUTE_TYPE_ORDER.map((t, i) => [t, i]),
);

export default function RoutesPanel({
  onSelectRoute,
  onClose,
}: RoutesPanelProps) {
  const [routes, setRoutes] = useState<Route[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const res = await fetch("/api/routes");
        if (!res.ok || !active) return;
        const data = await res.json();
        if (active && Array.isArray(data)) setRoutes(data);
      } catch {
        /* ignore */
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => {
      active = false;
    };
  }, []);

  const filtered = useMemo(() => {
    let list = routes;
    if (filterType !== null)
      list = list.filter((r) => r.route_type === filterType);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (r) =>
          r.route_short_name.toLowerCase().includes(q) ||
          r.route_long_name.toLowerCase().includes(q),
      );
    }
    return list.sort((a, b) => {
      const ta = TYPE_ORDER_INDICES.get(a.route_type) ?? 999;
      const tb = TYPE_ORDER_INDICES.get(b.route_type) ?? 999;
      if (ta !== tb) return ta - tb;
      const na = parseInt(a.route_short_name, 10);
      const nb = parseInt(b.route_short_name, 10);
      if (!isNaN(na) && !isNaN(nb)) return na - nb;
      return a.route_short_name.localeCompare(b.route_short_name);
    });
  }, [routes, search, filterType]);

  const handleSelect = useCallback(
    (r: Route) => {
      onSelectRoute?.(r.route_id, r.route_type);
      onClose();
    },
    [onSelectRoute, onClose],
  );

  if (loading) {
    return (
      <p
        className="side-panel-text py-3"
        style={{ color: "var(--text-muted)" }}
      >
        Зареждане...
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <input
        ref={inputRef}
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Търси линия..."
        className="side-panel-text w-full rounded-xl border px-3 py-2 outline-none"
        style={{
          background: "var(--surface-elevated)",
          borderColor: "var(--border)",
          color: "var(--text)",
        }}
      />

      <div className="flex flex-wrap gap-1.5">
        <FilterChip
          active={filterType === null}
          onClick={() => setFilterType(null)}
          label="Всички"
          color="var(--text-secondary)"
        />
        {ROUTE_TYPE_ORDER.map((t) => {
          const meta = ROUTE_TYPE_CONFIG[t];
          if (!meta) return null;
          return (
            <FilterChip
              key={t}
              active={filterType === t}
              onClick={() => setFilterType((prev) => (prev === t ? null : t))}
              label={meta.label}
              color={meta.color}
            />
          );
        })}
      </div>

      <div className="space-y-1.5">
        {filtered.length === 0 && (
          <p
            className="side-panel-text py-2"
            style={{ color: "var(--text-muted)" }}
          >
            Няма намерени линии.
          </p>
        )}
        {filtered.map((r) => {
          const meta = ROUTE_TYPE_CONFIG[r.route_type];
          return (
            <button
              key={r.route_id}
              type="button"
              onClick={() => handleSelect(r)}
              className="flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors"
              style={{
                background: "var(--surface-elevated)",
                borderColor: "var(--border)",
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.background = "var(--control-hover)")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.background = "var(--surface-elevated)")
              }
            >
              <span
                className="inline-flex h-7 min-w-[3rem] items-center justify-center rounded-md px-2 text-sm font-bold text-white"
                style={{ background: meta?.color ?? "#BE1E2D" }}
              >
                {r.route_short_name}
              </span>
              <div className="min-w-0 flex-1">
                <p
                  className="truncate text-sm font-medium"
                  style={{ color: "var(--text)" }}
                >
                  {r.route_long_name || r.route_short_name}
                </p>
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                  {meta?.label ?? "Друго"}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
