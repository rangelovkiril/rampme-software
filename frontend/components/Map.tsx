'use client'

import { useCallback, useEffect, useState } from 'react'
import FloatingNav from './FloatingNav'
import MapViewport from './MapViewport'
import SidePanel from './SidePanel'

export const TILES = {
  light: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
  dark: 'https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png',
}

export default function CityMap() {
  const [activePanel, setActivePanel] = useState<string | null>(null)
  const [dark, setDark] = useState(false)
  const [tracking, setTracking] = useState(false)

  useEffect(() => {
    setDark(document.documentElement.classList.contains('dark'))
  }, [])

  const toggleTheme = useCallback(() => {
    const next = !dark
    setDark(next)
    document.documentElement.classList.toggle('dark', next)
    localStorage.setItem('theme', next ? 'dark' : 'light')
  }, [dark])

  function togglePanel(name: string) {
    setActivePanel((prev) => (prev === name ? null : name))
  }

  return (
    <div className="relative h-full w-full">
      <MapViewport
        tileUrl={dark ? TILES.dark : TILES.light}
        dark={dark}
        onToggleTheme={toggleTheme}
        tracking={tracking}
        onToggleTracking={() => setTracking((prev) => !prev)}
      />

      <FloatingNav activePanel={activePanel} onTogglePanel={togglePanel} />
      <SidePanel activePanel={activePanel} onClose={() => setActivePanel(null)} />
    </div>
  )
}
