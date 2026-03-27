'use client'

interface MapControlsProps {
  dark: boolean
  onToggleTheme: () => void
  tracking: boolean
  onToggleTracking: () => void
  liftLocate?: boolean
}

export default function MapControls({
  dark,
  onToggleTheme,
  tracking,
  onToggleTracking,
  liftLocate = false
}: MapControlsProps) {
  return (
    <div className="absolute right-4 bottom-8 z-[800] flex flex-col gap-2">
      {/* Theme toggle */}
      <ControlButton onClick={onToggleTheme} title={dark ? 'Light mode' : 'Dark mode'}>
        {dark ? (
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
            <circle cx="12" cy="12" r="5" />
            <line x1="12" y1="1" x2="12" y2="3" />
            <line x1="12" y1="21" x2="12" y2="23" />
            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
            <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
            <line x1="1" y1="12" x2="3" y2="12" />
            <line x1="21" y1="12" x2="23" y2="12" />
            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
            <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
          </svg>
        ) : (
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
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
          </svg>
        )}
      </ControlButton>

      <div className="h-px w-6 self-center" style={{ background: 'var(--border)' }} />

      {/* Live location toggle */}
      <ControlButton
        onClick={onToggleTracking}
        title={tracking ? 'Stop tracking' : 'Track my location'}
        active={tracking}
        className={`transition-transform duration-300 ${liftLocate ? 'locate-btn-lift' : ''}`}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <circle cx="12" cy="12" r="4" />
          <line x1="12" y1="2" x2="12" y2="6" />
          <line x1="12" y1="18" x2="12" y2="22" />
          <line x1="2" y1="12" x2="6" y2="12" />
          <line x1="18" y1="12" x2="22" y2="12" />
        </svg>
      </ControlButton>
    </div>
  )
}

function ControlButton({
  onClick,
  title,
  children,
  active = false,
  className = ''
}: {
  onClick: () => void
  title: string
  children: React.ReactNode
  active?: boolean
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className={`map-control-btn flex cursor-pointer items-center justify-center rounded-xl transition-all active:scale-95 ${className}`}
      style={{
        background: active ? '#3b82f6' : 'var(--control-bg)',
        color: active ? '#ffffff' : 'var(--text-secondary)',
        boxShadow: 'var(--shadow)'
      }}
      onMouseEnter={e => {
        if (!active) e.currentTarget.style.background = 'var(--control-hover)'
      }}
      onMouseLeave={e => {
        if (!active) e.currentTarget.style.background = 'var(--control-bg)'
      }}
    >
      {children}
    </button>
  )
}
