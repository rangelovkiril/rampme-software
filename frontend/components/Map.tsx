'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { MapContainer, TileLayer } from 'react-leaflet'
import type { Map as LeafletMap } from 'leaflet'
import StopsLayer from './layers/StopsLayer'
import VehiclesLayer from './layers/VehiclesLayer'
import RouteLinesLayer from './layers/RouteLinesLayer'
import LiveLocation from './layers/LiveLocation'
import StopArrivalsSheet from './sheets/StopArrivalsSheet'
import VehicleTripSheet from './sheets/VehicleTripSheet'
import MapControls from './ui/MapControls'
import FloatingNav from './ui/FloatingNav'
import SidePanel from './SidePanel'
import { useRamp } from '@/contexts/RampContext'
import type { Stop, Vehicle } from '@/lib/types'

const TILES = {
  dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
  light: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
}

const SOFIA_CENTER = { lat: 42.6977, lng: 23.3219 }

export default function Map() {
  const mapRef = useRef<LeafletMap | null>(null)
  const [dark, setDark] = useState(true)
  const [tracking, setTracking] = useState(false)
  const [selectedStop, setSelectedStop] = useState<Stop | null>(null)
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null)
  const [selectedRoute, setSelectedRoute] = useState<{ routeId: string; routeType: number } | null>(null)
  const [activePanel, setActivePanel] = useState<string | null>(null)
  const [navCloseSignal, setNavCloseSignal] = useState(0)

  const { lockedVehicleId } = useRamp()

  useEffect(() => {
    if (lockedVehicleId && !selectedVehicle) {
      setSelectedVehicle({ id: lockedVehicleId } as Vehicle)
      setSelectedStop(null)
    }
  }, [lockedVehicleId]) // eslint-disable-line react-hooks/exhaustive-deps

  const toggleTheme = useCallback(() => setDark((d) => !d), [])
  const toggleTracking = useCallback(() => setTracking((t) => !t), [])
  const togglePanel = useCallback((p: string) => {
    setActivePanel((c) => {
      if (c === p) return null
      setSelectedStop(null)
      setSelectedVehicle(null)
      return p
    })
  }, [])
  const closePanel = useCallback(() => setActivePanel(null), [])

  const handleVehicleSelect = useCallback((v: Vehicle) => {
    setSelectedVehicle(v)
    setSelectedStop(null)
    setActivePanel(null)
    setNavCloseSignal(s => s + 1)
  }, [])

  const handleVehicleOpen = useCallback((vehicleId: string) => {
    setSelectedVehicle({ id: vehicleId } as Vehicle)
    setSelectedStop(null)
    setActivePanel(null)
    setNavCloseSignal(s => s + 1)
  }, [])

  const handleStopSelect = useCallback((s: Stop) => {
    setSelectedStop(s)
    setSelectedVehicle(null)
    setActivePanel(null)
    setNavCloseSignal(n => n + 1)
  }, [])

  return (
    <div className="relative h-screen w-screen overflow-hidden">
      <MapContainer
        center={SOFIA_CENTER}
        zoom={14}
        className="h-full w-full"
        zoomControl={false}
        ref={(m) => { mapRef.current = m ?? null }}
      >
        <TileLayer url={dark ? TILES.dark : TILES.light} />
        <RouteLinesLayer routeId={selectedRoute?.routeId ?? null} routeType={selectedRoute?.routeType ?? null} />
        <LiveLocation active={tracking} onError={(_, code) => { if (code === 1) setTracking(false) }} />
        <StopsLayer selectedStopId={selectedStop?.stop_id ?? null} onStopSelect={setSelectedStop} />
        <VehiclesLayer onVehicleSelect={handleVehicleSelect} selectedVehicleId={selectedVehicle?.id ?? null} />
      </MapContainer>

      <MapControls
        dark={dark}
        onToggleTheme={toggleTheme}
        tracking={tracking}
        liftLocate={Boolean(selectedStop)}
        onToggleTracking={toggleTracking}
      />

      <FloatingNav
        activePanel={activePanel}
        onTogglePanel={togglePanel}
        onOpenVehicle={handleVehicleOpen}
        onReservationsOpen={() => { setSelectedStop(null); setSelectedVehicle(null); setActivePanel(null) }}
        closeSignal={navCloseSignal}
      />
      <SidePanel
        activePanel={activePanel}
        onClose={closePanel}
        onSelectRoute={(routeId, routeType) => setSelectedRoute({ routeId, routeType })}
        onSelectStop={handleStopSelect}
        onSelectVehicle={(vehicleId) => { handleVehicleOpen(vehicleId); closePanel() }}
      />

      <StopArrivalsSheet
        stop={selectedStop}
        onClose={() => setSelectedStop(null)}
        onVehicleLock={handleVehicleOpen}
      />
      <VehicleTripSheet vehicle={selectedVehicle} onClose={() => setSelectedVehicle(null)} />
    </div>
  )
}
