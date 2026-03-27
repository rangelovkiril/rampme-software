'use client'

import L from 'leaflet'
import { useEffect, useRef } from 'react'
import { useMap } from 'react-leaflet'

const DOT_ICON = L.divIcon({
  className: '',
  html: '<div style="width:14px;height:14px;border-radius:50%;background:#3b82f6;border:2.5px solid #fff;box-shadow:0 0 0 4px rgba(59,130,246,0.18),0 1px 4px rgba(0,0,0,0.3)"></div>',
  iconSize: [14, 14],
  iconAnchor: [7, 7],
})

const ERROR_THROTTLE_MS = 15_000

type LiveLocationProps = {
  active: boolean
  onError?: (msg: string, code?: number) => void
}

export default function LiveLocation({ active, onError }: LiveLocationProps) {
  const map = useMap()
  const dotRef = useRef<L.Marker | null>(null)
  const pulseRef = useRef<L.CircleMarker | null>(null)
  const accuracyRef = useRef<L.Circle | null>(null)
  const watchRef = useRef<number | null>(null)
  const firstFixRef = useRef(true)
  const lastErrorRef = useRef<{ code: number; at: number } | null>(null)
  const onErrorRef = useRef(onError)

  useEffect(() => {
    onErrorRef.current = onError
  }, [onError])

  function clearWatch() {
    if (watchRef.current !== null) {
      navigator.geolocation.clearWatch(watchRef.current)
      watchRef.current = null
    }
  }

  function notifyError(code: number, message: string) {
    const now = Date.now()
    const last = lastErrorRef.current
    if (last && last.code === code && now - last.at < ERROR_THROTTLE_MS) return

    lastErrorRef.current = { code, at: now }
    onErrorRef.current?.(message, code)
  }

  function applyPosition(pos: GeolocationPosition) {
    const latlng = L.latLng(pos.coords.latitude, pos.coords.longitude)
    const accuracy = pos.coords.accuracy

    if (firstFixRef.current) {
      map.flyTo(latlng, 16, { duration: 1.2 })
      firstFixRef.current = false
    }

    // Reset error throttle after a successful fix.
    lastErrorRef.current = null

    if (accuracyRef.current) {
      accuracyRef.current.setLatLng(latlng)
      accuracyRef.current.setRadius(accuracy)
    } else {
      accuracyRef.current = L.circle(latlng, {
        radius: accuracy,
        fillColor: '#3b82f6',
        fillOpacity: 0.06,
        color: '#3b82f6',
        weight: 0.5,
        opacity: 0.15,
      }).addTo(map)
    }

    if (pulseRef.current) {
      pulseRef.current.setLatLng(latlng)
    } else {
      pulseRef.current = L.circleMarker(latlng, {
        radius: 18,
        fillColor: '#3b82f6',
        fillOpacity: 0.12,
        color: '#3b82f6',
        weight: 1.5,
        opacity: 0.25,
        className: 'location-pulse',
      }).addTo(map)
    }

    if (dotRef.current) {
      dotRef.current.setLatLng(latlng)
    } else {
      dotRef.current = L.marker(latlng, {
        icon: DOT_ICON,
        zIndexOffset: 9999,
        interactive: false,
      }).addTo(map)
    }
  }

  useEffect(() => {
    if (!active) {
      clearWatch()
      if (pulseRef.current) {
        map.removeLayer(pulseRef.current)
        pulseRef.current = null
      }
      if (accuracyRef.current) {
        map.removeLayer(accuracyRef.current)
        accuracyRef.current = null
      }
      firstFixRef.current = true
      return
    }

    if (!navigator.geolocation) {
      notifyError(0, 'Geolocation is not supported by your browser.')
      return
    }

    if (!window.isSecureContext) {
      notifyError(0, 'Location requires a secure context. Open the app on localhost or HTTPS.')
      return
    }

    // Reset any existing watch before starting a new tracking session.
    clearWatch()

    // Quick bootstrap call for immediate best-effort fix (cached or fresh).
    navigator.geolocation.getCurrentPosition(
      applyPosition,
      (err) => {
        if (err.code === 1) {
          notifyError(1, 'Location permission denied. Please allow location access in your browser.')
        } else if (err.code === 2) {
          notifyError(
            2,
            'Location unavailable. Make sure Location Services are enabled in Windows Settings > Privacy & Security > Location.',
          )
        }
      },
      { enableHighAccuracy: false, maximumAge: 5 * 60_000, timeout: 12_000 },
    )

    watchRef.current = navigator.geolocation.watchPosition(
      applyPosition,
      (err) => {
        if (err.code === 1) {
          notifyError(1, 'Location permission denied. Please allow location access in your browser.')
          return
        }

        if (err.code === 2) {
          notifyError(
            2,
            'Location unavailable. Make sure Location Services are enabled in Windows Settings > Privacy & Security > Location.',
          )
          return
        }

        if (err.code === 3) {
          notifyError(
            3,
            'Location fix is taking longer than expected. Keep tracking on and try again in a few seconds.',
          )
          return
        }

        notifyError(err.code, 'Could not get your location.')
      },
      // No explicit timeout here; long-lived watch should keep trying.
      { enableHighAccuracy: false, maximumAge: 60_000 },
    )

    return () => {
      clearWatch()
    }
  }, [active, map])

  useEffect(() => {
    return () => {
      clearWatch()
      if (dotRef.current) {
        map.removeLayer(dotRef.current)
        dotRef.current = null
      }
      if (pulseRef.current) {
        map.removeLayer(pulseRef.current)
        pulseRef.current = null
      }
      if (accuracyRef.current) {
        map.removeLayer(accuracyRef.current)
        accuracyRef.current = null
      }
      firstFixRef.current = true
    }
  }, [map])

  return null
}
