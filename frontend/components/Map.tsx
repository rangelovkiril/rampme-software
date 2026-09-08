'use client'

import type { StopResponse as Stop, EnrichedVehicle as Vehicle } from '@backend/schemas'
import type { Map as LeafletMap } from 'leaflet'
import { useCallback, useEffect, useRef, useState } from 'react'
import { MapContainer, TileLayer } from 'react-leaflet'
import { useRamp } from '@/contexts/RampContext'
import { api } from '@/lib/api'
import LiveLocation from './layers/LiveLocation'
import RouteLinesLayer from './layers/RouteLinesLayer'
import StopsLayer from './layers/StopsLayer'
import VehiclesLayer from './layers/VehiclesLayer'
import SidePanel from './SidePanel'
import StopArrivalsSheet from './sheets/StopArrivalsSheet'
import VehicleTripSheet from './sheets/VehicleTripSheet'
import FloatingNav from './ui/FloatingNav'
import MapControls from './ui/MapControls'

const TILES = {
  dark: `https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png?key=${process.env.NEXT_PUBLIC_CARTO_API_KEY}`,
  light: `https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png?key=${process.env.NEXT_PUBLIC_CARTO_API_KEY}`,
}

const SOFIA_CENTER = { lat: 42.6977, lng: 23.3219 }

export default function MapView() {
  const mapRef = useRef<LeafletMap | null>(null)
  const [dark, setDark] = useState(true)
  const [tracking, setTracking] = useState(false)
  const [selectedStop, setSelectedStop] = useState<Stop | null>(null)
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null)
  const [selectedRoute, setSelectedRoute] = useState<{
    routeId: string
    routeType: number
  } | null>(null)
  const [activePanel, setActivePanel] = useState<string | null>(null)
  const [navCloseSignal, setNavCloseSignal] = useState(0)

  const { lockedVehicleId } = useRamp()

  // This must fire only when a vehicle becomes locked. Depending on selectedVehicle would
  // re-run it the moment the user closes the sheet, re-selecting the locked vehicle and
  // making the sheet impossible to dismiss.
  // biome-ignore lint/correctness/useExhaustiveDependencies: deliberate.
  useEffect(() => {
    if (lockedVehicleId && !selectedVehicle) {
      setSelectedVehicle({ id: lockedVehicleId } as Vehicle)
      setSelectedStop(null)
    }
  }, [lockedVehicleId])

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
    setNavCloseSignal((s) => s + 1)
    if (v.routeId && v.routeType != null)
      setSelectedRoute({ routeId: v.routeId, routeType: v.routeType })
  }, [])

  const handleTripLoaded = useCallback((routeId: string | null, routeType: number | null) => {
    if (routeId && routeType != null) setSelectedRoute({ routeId, routeType })
  }, [])

  const handleVehicleOpen = useCallback(async (vehicleId: string) => {
    setSelectedVehicle({ id: vehicleId } as Vehicle)
    setSelectedStop(null)
    setSelectedRoute(null)
    setActivePanel(null)
    setNavCloseSignal((s) => s + 1)

    try {
      const { data } = await api.realtime.vehicles.get({ query: {} })
      if (!data) return
      const v = data.vehicles.find((v) => v.id === vehicleId)
      if (v && Number.isFinite(v.lat) && Number.isFinite(v.lng)) {
        mapRef.current?.flyTo([v.lat, v.lng], Math.max(mapRef.current.getZoom(), 16), {
          animate: true,
          duration: 0.8,
        })
      }
    } catch {}
  }, [])

  const handleStopSelect = useCallback((s: Stop | null) => {
    setSelectedStop(s)
    setSelectedVehicle(null)
    setSelectedRoute(null)
    setActivePanel(null)
    setNavCloseSignal((n) => n + 1)
    if (s) {
      mapRef.current?.panTo([s.lat, s.lon], {
        animate: true,
        duration: 0.6,
      })
    }
  }, [])

  // Close the vehicle sheet WITHOUT triggering a map refit/zoom-out.
  // Previously `autoFit = selectedVehicle === null` caused RouteLinesLayer
  // to call fitBounds() on close → jarring unzoom. Now: clear state, no map op.
  const handleVehicleSheetClose = useCallback(() => {
    setSelectedVehicle(null)
    setSelectedRoute(null)
  }, [])

  return (
    <div className="relative h-screen w-screen overflow-hidden">
      <MapContainer
        center={SOFIA_CENTER}
        zoom={14}
        className="h-full w-full"
        zoomControl={false}
        ref={(m) => {
          mapRef.current = m ?? null
        }}
      >
        <TileLayer url={dark ? TILES.dark : TILES.light} />
        <RouteLinesLayer
          routeId={selectedRoute?.routeId ?? null}
          routeType={selectedRoute?.routeType ?? null}
          autoFit={false}
        />
        <LiveLocation
          active={tracking}
          onError={(_, code) => {
            if (code === 1) setTracking(false)
          }}
        />
        <StopsLayer selectedStopId={selectedStop?.id ?? null} onStopSelect={handleStopSelect} />
        <VehiclesLayer
          onVehicleSelect={handleVehicleSelect}
          selectedVehicleId={selectedVehicle?.id ?? null}
        />
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
        onReservationsOpen={() => {
          setSelectedStop(null)
          setSelectedVehicle(null)
          setActivePanel(null)
        }}
        closeSignal={navCloseSignal}
      />
      <SidePanel
        activePanel={activePanel}
        onClose={closePanel}
        onSelectRoute={(routeId, routeType) => setSelectedRoute({ routeId, routeType })}
        onSelectStop={handleStopSelect}
        onSelectVehicle={(vehicleId) => {
          handleVehicleOpen(vehicleId)
          closePanel()
        }}
      />

      <StopArrivalsSheet
        stop={selectedStop}
        onClose={() => setSelectedStop(null)}
        onVehicleLock={handleVehicleOpen}
      />
      <VehicleTripSheet
        vehicle={selectedVehicle}
        onClose={handleVehicleSheetClose}
        onTripLoaded={handleTripLoaded}
      />
    </div>
  )
}
