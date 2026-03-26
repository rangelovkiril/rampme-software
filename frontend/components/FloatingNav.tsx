'use client'

interface FloatingNavProps {
  activePanel: string | null
  onTogglePanel: (name: string) => void
}

/**
 * Renders a fixed, centered floating navigation bar with three pill buttons for Alerts, Routes, and Stops.
 *
 * The active pill is determined by `activePanel`; clicking a pill calls `onTogglePanel` with that panel's name.
 *
 * @param activePanel - The name of the currently active panel (`'alerts' | 'routes' | 'stops'`) or `null` if none is active
 * @param onTogglePanel - Callback invoked with the panel name when a pill is clicked
 * @returns A JSX element containing the floating navigation bar with three interactive pills
 */
export default function FloatingNav({ activePanel, onTogglePanel }: FloatingNavProps) {
  return (
    <div className="fixed top-4 left-1/2 z-[800] -translate-x-1/2">
      <nav
        className="flex items-center gap-1 rounded-2xl px-1.5 py-1.5 backdrop-blur-xl"
        style={{
          background: 'var(--surface-overlay)',
          boxShadow: 'var(--shadow-lg)',
          border: '1px solid var(--border)'
        }}
      >
        <NavPill
          active={activePanel === 'alerts'}
          onClick={() => onTogglePanel('alerts')}
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
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
          }
          label="Известия"
        />
        <NavPill
          active={activePanel === 'routes'}
          onClick={() => onTogglePanel('routes')}
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
          active={activePanel === 'stops'}
          onClick={() => onTogglePanel('stops')}
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
  )
}

/**
 * Render a pill-shaped navigation button for the floating navigation bar.
 *
 * @param active - Whether the pill is visually active; controls background and text color
 * @param onClick - Callback invoked when the pill is clicked
 * @param icon - Icon element displayed to the left of the label
 * @param label - Text label shown inside the pill (hidden on small screens)
 * @returns The JSX button element representing the navigation pill
 */
function NavPill({
  active,
  onClick,
  icon,
  label
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
}) {
  return (
function NavPill({
  active,
  onClick,
  icon,
  label
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      className="flex cursor-pointer items-center gap-2 rounded-xl px-4 py-2 font-medium text-[13px] transition-all"
      style={{
        background: active ? 'var(--primary)' : 'transparent',
        color: active ? '#fff' : 'var(--text-secondary)'
      }}
    >
      <span aria-hidden="true">{icon}</span>
      <span className="hidden sm:inline">{label}</span>
    </button>
  )
}
  )
}
