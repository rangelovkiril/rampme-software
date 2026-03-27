"use client";

import { useRamp } from '@/contexts/RampContext'

interface FloatingNavProps {
  activePanel: string | null;
  onTogglePanel: (name: string) => void;
}

export default function FloatingNav({
  activePanel,
  onTogglePanel,
}: FloatingNavProps) {
  const { reservations } = useRamp()
  const activeCount = reservations.filter((r) => r.status === 'pending' || r.status === 'active').length

  return (
    <div
      className="fixed left-1/2 z-[800] -translate-x-1/2"
      style={{ top: 'var(--nav-top-offset)' }}
    >
      <nav
        className="flex items-center gap-1 rounded-2xl px-1.5 py-1.5 backdrop-blur-xl"
        style={{
          background: "var(--surface-overlay)",
          boxShadow: "var(--shadow-lg)",
          border: "1px solid var(--border)",
        }}
      >
        <NavPill
          active={activePanel === "reservations"}
          onClick={() => onTogglePanel("reservations")}
          badge={activeCount > 0 ? activeCount : undefined}
          icon={
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="4" r="2" />
              <path d="M10 9h4l1 5h3" />
              <path d="M11 14l-2 6" />
              <path d="M6 19a3 3 0 1 0 6 0" />
            </svg>
          }
          label="Резервации"
        />
        <NavPill
          active={activePanel === "routes"}
          onClick={() => onTogglePanel("routes")}
          icon={
            <svg
              width="16"
              height="16"
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
          }
          label="Линии"
        />
        <NavPill
          active={activePanel === "stops"}
          onClick={() => onTogglePanel("stops")}
          icon={
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
          }
          label="Спирки"
        />
      </nav>
    </div>
  );
}

function NavPill({
  active,
  onClick,
  icon,
  label,
  badge,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  badge?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      className="nav-pill relative flex cursor-pointer items-center gap-2 rounded-xl font-medium transition-all"
      style={{
        background: active ? "var(--primary)" : "transparent",
        color: active ? "#fff" : "var(--text-secondary)",
      }}
    >
      <span aria-hidden="true">{icon}</span>
      <span className="hidden sm:inline">{label}</span>
      {badge !== undefined && badge > 0 && (
        <span
          className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold text-white"
          style={{ background: '#ef4444' }}
        >
          {badge}
        </span>
      )}
    </button>
  );
}
