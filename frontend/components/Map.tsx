'use client'

import { useCallback, useEffect, useState } from 'react'
import L from 'leaflet'
import { MapContainer, useMap } from 'react-leaflet'
import MapControls from './MapControls'
import FloatingNav from './FloatingNav'
import SidePanel from './SidePanel'
import LiveLocation from './LiveLocation'

const TILES = {
  light: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
  dark: 'https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png',
}

export default function Map() {
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
      <MapContainer
        center={[42.6977, 23.3219]}
        zoom={13}
        zoomControl={false}
        attributionControl={false}
        className="h-full w-full"
      >
        <TileSwitch url={dark ? TILES.dark : TILES.light} />
        <LiveLocation active={tracking} />
        <MapControls
          dark={dark}
          onToggleTheme={toggleTheme}
          tracking={tracking}
          onToggleTracking={() => setTracking((t) => !t)}
        />
      </MapContainer>

      <FloatingNav activePanel={activePanel} onTogglePanel={togglePanel} />
      <SidePanel activePanel={activePanel} onClose={() => setActivePanel(null)} />
    </div>
  )
}

function TileSwitch({ url }: { url: string }) {
  const map = useMap()

  useEffect(() => {
    map.eachLayer((layer) => {
      if ((layer as any)._url) map.removeLayer(layer)
    })
    L.tileLayer(url, { maxZoom: 19 }).addTo(map)
  }, [url, map])

  return null
}
