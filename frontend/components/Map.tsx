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

/**
 * Render an interactive city map with tile switching, live location, stops and vehicles layers, and UI for theme, tracking, and side panels.
 *
 * Initializes theme state from the document's `dark` class and persists theme changes to `localStorage`; manages which side panel is open and whether live tracking is enabled.
 *
 * @returns A JSX element that renders the interactive map and its surrounding controls and panels.
 */
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
    setActivePanel(prev => (prev === name ? null : name))
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
        <StopsLayer />
        <VehiclesLayer />
        <MapControls
          dark={dark}
          onToggleTheme={toggleTheme}
          tracking={tracking}
          onToggleTracking={() => setTracking(t => !t)}
        />
      </MapContainer>

      <FloatingNav activePanel={activePanel} onTogglePanel={togglePanel} />
      <SidePanel activePanel={activePanel} onClose={() => setActivePanel(null)} />
    </div>
  )
}

/**
 * Switches the map's visible tile layer to the provided tile URL template.
 *
 * This component removes any existing Leaflet tile layers from the map and adds a new tile layer created from `url`.
 *
 * @param url - Tile URL template (e.g., a `{z}/{x}/{y}` tiles endpoint) used to create the new Leaflet tile layer
 * @returns `null` (does not render any DOM output)
 */
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
