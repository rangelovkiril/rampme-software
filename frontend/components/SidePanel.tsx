'use client'

import { useEffect } from 'react'

interface SidePanelProps {
  activePanel: string | null
  onClose: () => void
}

const panelContent: Record<string, { title: string; placeholder: string }> = {
  alerts: {
    title: 'Известия',
    placeholder: 'Известията ще се заредят от API данните.'
  },
  routes: {
    title: 'Линии',
    placeholder: 'Линиите ще се заредят от GTFS данните.'
  },
  stops: {
    title: 'Спирки',
    placeholder: 'Спирките ще се заредят от GTFS данните.'
  }
}

/**
 * Render a left-side sliding panel that shows content for the given panel identifier.
 *
 * @param activePanel - The key of the panel to display (e.g., "alerts", "routes", "stops"); `null` hides the panel.
 * @param onClose - Callback invoked to close the panel (called on Escape key or when the close button is clicked).
 * @returns The side panel element that slides in from the left and displays the selected panel's title and placeholder content.
 */
export default function SidePanel({ activePanel, onClose }: SidePanelProps) {
  const isOpen = activePanel !== null && activePanel in panelContent
  const content = activePanel ? panelContent[activePanel] : null

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && isOpen) onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [isOpen, onClose])

  return (
    <aside
      className={`fixed top-0 bottom-0 left-0 z-[700] flex w-[340px] flex-col backdrop-blur-xl transition-transform duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] max-sm:top-[72px] max-sm:bottom-auto max-sm:left-1/2 max-sm:w-[calc(100vw-16px)] max-sm:max-w-[430px] max-sm:-translate-x-1/2 max-sm:rounded-2xl max-sm:shadow-[var(--shadow-lg)] ${
        isOpen
          ? 'translate-x-0 max-sm:translate-y-0'
          : '-translate-x-full max-sm:translate-x-0 max-sm:-translate-y-[130%]'
      }`}
      style={{
        background: 'var(--surface-overlay)',
        border: '1px solid var(--border)'
      }}
    >
      {content && (
        <>
          <div className="flex items-center justify-between px-5 pt-5 pb-3">
            <h2 className="font-semibold text-sm" style={{ color: 'var(--text)' }}>
              {content.title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg transition-colors"
              style={{ color: 'var(--text-muted)' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--control-hover)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-4 pb-4">
            <div
              className="rounded-xl p-4"
              style={{
                background: 'var(--surface-elevated)',
                border: '1px solid var(--border)'
              }}
            >
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                {content.placeholder}
              </p>
            </div>
          </div>
        </>
      )}
    </aside>
  )
}
