'use client'

import { memo } from 'react'
import { MapContainer, TileLayer } from 'react-leaflet'
import LiveLocation from './LiveLocation'
import MapControls from './MapControls'

const DEFAULT_CENTER: [number, number] = [42.6977, 23.3219]

interface MapViewportProps {
  tileUrl: string
  dark: boolean
  onToggleTheme: () => void
  tracking: boolean
  onToggleTracking: () => void
}

function MapViewportBase({
  tileUrl,
  dark,
  onToggleTheme,
  tracking,
  onToggleTracking,
}: MapViewportProps) {
  return (
    <div className="absolute inset-0">
      <MapContainer
        center={DEFAULT_CENTER}
        zoom={13}
        zoomControl={false}
        attributionControl={false}
        className="h-full w-full"
        preferCanvas={true}
        zoomSnap={0.5}
        zoomDelta={0.5}
      >
        <TileLayer url={tileUrl} keepBuffer={3} updateWhenZooming={true} />
        <MapControls
          dark={dark}
          onToggleTheme={onToggleTheme}
          tracking={tracking}
          onToggleTracking={onToggleTracking}
        />
        <LiveLocation active={tracking} />
      </MapContainer>
    </div>
  )
}

// Keep the Leaflet tree isolated from parent UI state updates.
const MapViewport = memo(MapViewportBase)

export default MapViewport
