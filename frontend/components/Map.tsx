'use client'

import L from 'leaflet'
import { useCallback, useEffect, useState } from 'react'
import { MapContainer, useMap } from 'react-leaflet'
import FloatingNav from './FloatingNav'
import LiveLocation from './LiveLocation'
import MapControls from './MapControls'
import SidePanel from './SidePanel'
import StopsLayer from './StopsLayer'
import VehiclesLayer from './VehiclesLayer'

const TILES = {
  light: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
  dark: 'https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png'
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

  const togglePanel = useCallback((name: string) => {
    setActivePanel(prev => (prev === name ? null : name))
  }, [])

  const toggleTracking = useCallback(() => setTracking(t => !t), [])

  const closePanel = useCallback(() => setActivePanel(null), [])

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
        <StopsLayer />
        <VehiclesLayer />
        <MapControls
          dark={dark}
          onToggleTheme={toggleTheme}
          tracking={tracking}
          onToggleTracking={toggleTracking}
        />
      </MapContainer>

      <FloatingNav activePanel={activePanel} onTogglePanel={togglePanel} />
      <SidePanel activePanel={activePanel} onClose={closePanel} />
    </div>
  )
}

function TileSwitch({ url }: { url: string }) {
  const map = useMap()

  useEffect(() => {
    map.eachLayer(layer => {
      // Use instanceof check instead of 'as any'
      if (layer instanceof L.TileLayer) {
        map.removeLayer(layer)
      }
    })
    L.tileLayer(url, { maxZoom: 19 }).addTo(map)
  }, [url, map])

  return null
}