"use client";

import L from 'leaflet'
import { useCallback, useEffect, useState } from 'react'
import { MapContainer, useMap } from 'react-leaflet'
import FloatingNav from './FloatingNav'
import LiveLocation from './LiveLocation'
import MapControls from './MapControls'
import SidePanel from './SidePanel'
import StopArrivalsSheet from './StopArrivalsSheet'
import RouteLinesLayer from './RouteLinesLayer'
import StopsLayer from './StopsLayer'
import type { Stop } from './StopsLayer'
import VehiclesLayer from './VehiclesLayer'

const TILES = {
  light:
    "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
  dark: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
};

/** Tiny bridge that exposes the Leaflet map instance to parent state */
function MapBridge({ onMap }: { onMap: (map: L.Map) => void }) {
  const map = useMap()
  useEffect(() => { onMap(map) }, [map, onMap])
  return null
}

export default function CityMap() {
  const [mapRef, setMapRef] = useState<L.Map | null>(null)
  const [activePanel, setActivePanel] = useState<string | null>(null)
  const [dark, setDark] = useState(false)
  const [tracking, setTracking] = useState(false)
  const [selectedStop, setSelectedStop] = useState<Stop | null>(null)
  const [selectedRoute, setSelectedRoute] = useState<{ routeId: string; routeType: number } | null>(null)

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  const toggleTheme = useCallback(() => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
  }, [dark]);

  const togglePanel = useCallback((name: string) => {
    setActivePanel((prev) => (prev === name ? null : name));
  }, []);

  const toggleTracking = useCallback(() => setTracking((t) => !t), []);

  const handleLocationError = useCallback((msg: string, code?: number) => {
    // Keep tracking enabled on timeout/unavailable so geolocation can recover automatically.
    if (code === 3) {
      console.warn(msg)
      return
    }

    if (code === 1) {
      setTracking(false)
    }
    alert(msg)
  }, []);

  const closePanel = useCallback(() => setActivePanel(null), []);

  const storeMap = useCallback((m: L.Map) => setMapRef(m), [])

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
        <StopsLayer
          selectedStopId={selectedStop?.stop_id ?? null}
          onStopSelect={setSelectedStop}
        />
        <VehiclesLayer onVehicleSelect={(routeId, routeType) => setSelectedRoute((prev) => prev?.routeId === routeId ? null : { routeId, routeType })} />
      </MapContainer>

      {/* Controls rendered OUTSIDE MapContainer so Leaflet cannot intercept clicks */}
      <MapControls
        map={mapRef}
        dark={dark}
        onToggleTheme={toggleTheme}
        tracking={tracking}
        liftLocate={Boolean(selectedStop)}
        onToggleTracking={toggleTracking}
      />

      <FloatingNav activePanel={activePanel} onTogglePanel={togglePanel} />
        <SidePanel activePanel={activePanel} onClose={closePanel} />
      <StopArrivalsSheet stop={selectedStop} onClose={() => setSelectedStop(null)} />
    </div>
  );
}

function TileSwitch({ url }: { url: string }) {
  const map = useMap();

  useEffect(() => {
    map.eachLayer((layer) => {
      if (layer instanceof L.TileLayer) {
        map.removeLayer(layer);
      }
    });
    L.tileLayer(url, { maxZoom: 19 }).addTo(map);
  }, [url, map]);

  return null;
}
