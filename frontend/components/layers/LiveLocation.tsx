'use client'

import L from 'leaflet'
import { useEffect, useRef } from 'react'
import { useMap } from 'react-leaflet'

function makeDotIcon(heading: number | null) {
  const arrow = heading !== null
    ? `<div style="position:absolute;top:-11px;left:50%;transform:translateX(-50%) rotate(${heading}deg);
        width:0;height:0;
        border-left:4px solid transparent;
        border-right:4px solid transparent;
        border-bottom:9px solid #3b82f6;
        opacity:0.9;z-index:2;"></div>`
    : ''
  return L.divIcon({
    className: '',
    html: `<div style="position:relative;display:flex;flex-direction:column;align-items:center;width:24px;height:33px">
      ${arrow}
      <div style="background:#3b82f6;border-radius:4px;width:22px;height:16px;
        display:flex;align-items:center;justify-content:center;flex-shrink:0;
        box-shadow:0 0 0 2px rgba(59,130,246,0.35),0 2px 8px rgba(0,0,0,0.4)">
        <svg width="10" height="11" viewBox="0 0 10 11" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="5" cy="2.5" r="2" fill="white"/>
          <path d="M1.5 10.5c0-2.5 7-2.5 7 0" stroke="white" stroke-width="1.3" fill="none" stroke-linecap="round"/>
        </svg>
      </div>
      <div style="width:2px;flex:1;background:#3b82f6"></div>
      <div style="width:6px;height:6px;border-radius:50%;background:#3b82f6;opacity:0.85;flex-shrink:0"></div>
    </div>`,
    iconSize: [24, 33],
    iconAnchor: [12, 33],
  })
}

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
    const heading = pos.coords.heading ?? null

    if (firstFixRef.current) {
      map.flyTo(latlng, 16, { duration: 1.2 })
      firstFixRef.current = false
    }

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
        radius: 22,
        fillColor: '#3b82f6',
        fillOpacity: 0.1,
        color: '#3b82f6',
        weight: 1,
        opacity: 0.2,
        className: 'location-pulse',
      }).addTo(map)
    }

    const icon = makeDotIcon(heading)
    if (dotRef.current) {
      dotRef.current.setLatLng(latlng)
      dotRef.current.setIcon(icon)
    } else {
      dotRef.current = L.marker(latlng, {
        icon,
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
