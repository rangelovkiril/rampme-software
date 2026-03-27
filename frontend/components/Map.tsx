"use client"

import L from 'leaflet'
import { useCallback, useEffect, useState } from 'react'
import { MapContainer, useMap } from 'react-leaflet'
import type { Stop, Vehicle, SelectedRoute } from '@/lib/types'
import FloatingNav from './ui/FloatingNav'
import MapControls from './ui/MapControls'
import LiveLocation from './layers/LiveLocation'
import RouteLinesLayer from './layers/RouteLinesLayer'
import StopsLayer from './layers/StopsLayer'
import VehiclesLayer from './layers/VehiclesLayer'
import SidePanel from './SidePanel'
import StopArrivalsSheet from './sheets/StopArrivalsSheet'
import VehicleTripSheet from './sheets/VehicleTripSheet'

const TILES = {
  light: "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
  dark: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
}

function MapBridge({ onMap }: { onMap: (map: L.Map) => void }) {
  const map = useMap()
  useEffect(() => { onMap(map) }, [map, onMap])
  return null
}

function TileSwitch({ url }: { url: string }) {
  const map = useMap()
  useEffect(() => {
    map.eachLayer((layer) => {
      if (layer instanceof L.TileLayer) map.removeLayer(layer)
    })
    L.tileLayer(url, { maxZoom: 19 }).addTo(map)
  }, [url, map])
  return null
}

export default function CityMap() {
  const [mapRef, setMapRef] = useState<L.Map | null>(null)
  const [activePanel, setActivePanel] = useState<string | null>(null)
  const [dark, setDark] = useState(false)
  const [tracking, setTracking] = useState(false)
  const [selectedStop, setSelectedStop] = useState<Stop | null>(null)
  const [selectedRoute, setSelectedRoute] = useState<SelectedRoute | null>(null)
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null)

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"))
  }, [])

  const toggleTheme = useCallback(() => {
    const next = !dark
    setDark(next)
    document.documentElement.classList.toggle("dark", next)
    localStorage.setItem("theme", next ? "dark" : "light")
  }, [dark])

  const togglePanel = useCallback((name: string) => {
    setActivePanel((prev) => (prev === name ? null : name))
  }, [])

  const toggleTracking = useCallback(() => setTracking((t) => !t), [])

  const handleLocationError = useCallback((msg: string, code?: number) => {
    if (code === 3) { console.warn(msg); return }
    if (code === 1) setTracking(false)
    alert(msg)
  }, [])

  const closePanel = useCallback(() => setActivePanel(null), [])
  const storeMap = useCallback((m: L.Map) => setMapRef(m), [])

  const handleVehicleSelect = useCallback((v: Vehicle) => {
    setSelectedRoute((prev) => prev?.routeId === v.route_id ? null : { routeId: v.route_id, routeType: v.route_type })
    setSelectedVehicle((prev) => prev?.id === v.id ? null : v)
  }, [])

  const handleStopSelect = useCallback((stop: Stop) => {
    setSelectedStop(stop)
    mapRef?.flyTo([stop.stop_lat, stop.stop_lon], 17, { duration: 1 })
  }, [mapRef])

  const handleCloseVehicle = useCallback(() => {
    setSelectedVehicle(null)
    setSelectedRoute(null)
  }, [])

  return (
    <div className="relative h-full w-full">
      <MapContainer
        center={[42.6977, 23.3219]}
        zoom={13}
        zoomControl={false}
        attributionControl={false}
        className="h-full w-full"
      >
        <MapBridge onMap={storeMap} />
        <TileSwitch url={dark ? TILES.dark : TILES.light} />
        <RouteLinesLayer routeId={selectedRoute?.routeId ?? null} routeType={selectedRoute?.routeType ?? null} />
        <LiveLocation active={tracking} onError={handleLocationError} />
        <StopsLayer selectedStopId={selectedStop?.stop_id ?? null} onStopSelect={setSelectedStop} />
        <VehiclesLayer onVehicleSelect={handleVehicleSelect} />
      </MapContainer>

      <MapControls
        map={mapRef}
        dark={dark}
        onToggleTheme={toggleTheme}
        tracking={tracking}
        liftLocate={Boolean(selectedStop)}
        onToggleTracking={toggleTracking}
      />

      <FloatingNav activePanel={activePanel} onTogglePanel={togglePanel} />
      <SidePanel
        activePanel={activePanel}
        onClose={closePanel}
        onSelectRoute={(routeId, routeType) => setSelectedRoute({ routeId, routeType })}
        onSelectStop={handleStopSelect}
      />
      <StopArrivalsSheet stop={selectedStop} onClose={() => setSelectedStop(null)} />
      <VehicleTripSheet vehicle={selectedVehicle} onClose={handleCloseVehicle} />
    </div>
  )
}
