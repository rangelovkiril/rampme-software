'use client'

import { useEffect } from 'react'
import { useRamp } from '@/contexts/RampContext'

export default function MissedBusAlert() {
  const { missedBusAlert, dismissMissedBusAlert } = useRamp()

  useEffect(() => {
    if (!missedBusAlert) return
    const t = setTimeout(dismissMissedBusAlert, 6000)
    return () => clearTimeout(t)
  }, [missedBusAlert, dismissMissedBusAlert])

  if (!missedBusAlert) return null

  return (
    <div
      role="alert"
      style={{
        position: 'fixed',
        bottom: '5rem',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 9999,
        background: '#ef4444',
        color: '#fff',
        borderRadius: '1rem',
        padding: '0.75rem 1.25rem',
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        boxShadow: '0 4px 24px rgba(0,0,0,0.25)',
        maxWidth: 'calc(100vw - 2rem)',
        fontWeight: 600,
        fontSize: '0.95rem',
      }}
    >
      <span>{missedBusAlert.message}</span>
      <button
        type="button"
        onClick={dismissMissedBusAlert}
        style={{
          background: 'rgba(255,255,255,0.25)',
          border: 'none',
          borderRadius: '0.5rem',
          color: '#fff',
          cursor: 'pointer',
          padding: '0.2rem 0.5rem',
          fontWeight: 700,
          fontSize: '0.85rem',
        }}
      >
        ✕
      </button>
    </div>
  )
}
