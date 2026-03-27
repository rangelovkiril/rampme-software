'use client'

import { useEffect } from 'react'
import type { Stop } from '@/lib/types'
import RoutesPanel from './panels/RoutesPanel'
import StopsPanel from './panels/StopsPanel'
import ReservationsPanel from './panels/ReservationsPanel'

const PANEL_IDS = ['routes', 'stops', 'reservations'] as const
type PanelId = (typeof PANEL_IDS)[number]

const PANEL_TITLES: Record<PanelId, string> = {
  routes: 'Линии',
  stops: 'Спирки',
  reservations: 'Резервации',
}

export interface SidePanelProps {
  activePanel: string | null
  onClose: () => void
  onSelectRoute?: (routeId: string, routeType: number) => void
  onSelectStop?: (stop: Stop) => void
  onSelectVehicle?: (vehicleId: string) => void
}

function isPanelId(value: string | null): value is PanelId {
  return value !== null && PANEL_IDS.includes(value as PanelId)
}

export default function SidePanel({ activePanel, onClose, onSelectRoute, onSelectStop, onSelectVehicle }: SidePanelProps) {
  const isOpen = isPanelId(activePanel)

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && isOpen) onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [isOpen, onClose])

  const handleOpenVehicle = (vehicleId: string) => {
    onSelectVehicle?.(vehicleId)
    onClose()
  }

  return (
    <aside
      className={`side-panel-shell fixed top-0 bottom-0 left-0 z-[700] flex flex-col overflow-x-hidden backdrop-blur-xl transition-transform duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] max-sm:top-[72px] max-sm:bottom-[60px] max-sm:left-1/2 max-sm:-translate-x-1/2 max-sm:rounded-2xl max-sm:shadow-[var(--shadow-lg)] max-sm:overflow-y-hidden ${
        isOpen
          ? 'translate-x-0 max-sm:translate-y-0'
          : '-translate-x-full max-sm:translate-x-0 max-sm:-translate-y-[130%]'
      }`}
      style={{
        background: 'var(--surface-overlay)',
        border: '1px solid var(--border)',
      }}
    >
      {isOpen && (
        <>
          <div className="flex items-center justify-between px-5 pt-5 pb-3 lg:px-7 lg:pt-7 lg:pb-4">
            <h2 className="side-panel-title font-semibold" style={{ color: 'var(--text)' }}>
              {PANEL_TITLES[activePanel]}
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="side-panel-close flex cursor-pointer items-center justify-center rounded-lg transition-colors"
              style={{ color: 'var(--text-muted)' }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--control-hover)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-4 pb-4 lg:px-7 lg:pb-7">
            {activePanel === 'routes' && <RoutesPanel onSelectRoute={onSelectRoute} onClose={onClose} />}
            {activePanel === 'stops' && <StopsPanel onSelectStop={onSelectStop} onClose={onClose} />}
            {activePanel === 'reservations' && <ReservationsPanel onOpenVehicle={handleOpenVehicle} />}
          </div>
        </>
      )}
    </aside>
  )
}
