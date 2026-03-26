"use client";

interface TopBarProps {
  activePanel: string | null;
  onTogglePanel: (name: string) => void;
}

export default function TopBar({ activePanel, onTogglePanel }: TopBarProps) {
  return (
    <header className="fixed top-0 left-0 right-0 z-[1000] h-[60px] bg-primary/90 backdrop-blur-[20px]">
      <div className="flex h-full items-center justify-between px-6">
        {/* Brand */}
        <div className="flex items-center gap-2 text-on-primary">
          <svg
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-secondary-container"
          >
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
          <span className="text-xl font-bold tracking-tight">Sofia Live</span>
        </div>

        {/* Nav */}
        <nav className="flex gap-1">
          <NavButton
            active={activePanel === null}
            onClick={() => onTogglePanel("map")}
            label="Карта"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
              <line x1="8" y1="2" x2="8" y2="18" />
              <line x1="16" y1="6" x2="16" y2="22" />
            </svg>
          </NavButton>
          <NavButton
            active={activePanel === "alerts"}
            onClick={() => onTogglePanel("alerts")}
            label="Известия"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </NavButton>
          <NavButton
            active={activePanel === "routes"}
            onClick={() => onTogglePanel("routes")}
            label="Линии"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="6" cy="19" r="3" />
              <circle cx="18" cy="5" r="3" />
              <path d="M12 19h4.5a3.5 3.5 0 0 0 0-7h-9a3.5 3.5 0 0 1 0-7H18" />
            </svg>
          </NavButton>
        </nav>
      </div>
    </header>
  );
}

function NavButton({
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
      onClick={onClick}
      className={`flex min-h-[48px] cursor-pointer items-center gap-1 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
        active
          ? "bg-secondary-container/15 text-secondary-container"
          : "text-white/70 hover:bg-white/10 hover:text-white"
      }`}
    >
      {children}
      <span className="max-sm:hidden">{label}</span>
    </button>
  );
}
