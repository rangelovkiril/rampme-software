'use client'

import L from 'leaflet'
import { useEffect, useRef } from 'react'
import { useMap } from 'react-leaflet'

export default function LiveLocation({ active }: { active: boolean }) {
  const map = useMap()
  const dotRef = useRef<L.CircleMarker | null>(null)
  const pulseRef = useRef<L.CircleMarker | null>(null)
  const accuracyRef = useRef<L.Circle | null>(null)
  const watchRef = useRef<number | null>(null)
  const firstFixRef = useRef(true)

  useEffect(() => {
    if (!active) {
      // Stop tracking but keep the last known location marker visible.
      if (watchRef.current !== null) {
        navigator.geolocation.clearWatch(watchRef.current)
        watchRef.current = null
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
      return
    }

    watchRef.current = navigator.geolocation.watchPosition(
      pos => {
        const latlng = L.latLng(pos.coords.latitude, pos.coords.longitude)
        const accuracy = pos.coords.accuracy

        // On first fix, fly to location
        if (firstFixRef.current) {
          map.flyTo(latlng, 16, { duration: 1.2 })
          firstFixRef.current = false
        }

        // Accuracy circle
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
            opacity: 0.15
          }).addTo(map)
        }

        // Pulse ring
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
            className: 'location-pulse'
          }).addTo(map)
        }

        // Solid dot
        if (dotRef.current) {
          dotRef.current.setLatLng(latlng)
        } else {
          dotRef.current = L.circleMarker(latlng, {
            radius: 7,
            fillColor: '#3b82f6',
            fillOpacity: 1,
            color: '#ffffff',
            weight: 2.5
          }).addTo(map)
        }
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 10000 }
    )

    return () => {
      if (watchRef.current !== null) {
        navigator.geolocation.clearWatch(watchRef.current)
        watchRef.current = null
      }
    }
  }, [active, map])

  useEffect(() => {
    return () => {
      if (watchRef.current !== null) {
        navigator.geolocation.clearWatch(watchRef.current)
        watchRef.current = null
      }
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
