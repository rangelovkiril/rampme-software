"use client";

import L from "leaflet";
import { useEffect, useRef, useState } from "react";
import { useMap } from "react-leaflet";
import type { Stop } from "@/lib/types";

const MIN_ZOOM_FOR_STOPS = 15;

function createStopIcon(selected = false) {
  return L.divIcon({
    className: "",
    html: `<div style="display:flex;align-items:center;justify-content:center;width:20px;height:20px;transform:translate(-50%,-50%)">
      <div style="width:16px;height:16px;border-radius:9999px;background:#2b2f37;border:2px solid #3b82f6;box-shadow:${selected ? "0 0 0 3px rgba(59,130,246,0.28),0 1px 6px rgba(0,0,0,0.35)" : "0 1px 5px rgba(0,0,0,0.35)"}"></div>
    </div>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });
}

function hasValidCoords(s: Stop) {
  return (
    Number.isFinite(s.stop_lat) &&
    Number.isFinite(s.stop_lon) &&
    s.stop_lat !== 0 &&
    s.stop_lon !== 0
  );
}

interface StopsLayerProps {
  selectedStopId?: string | null;
  onStopSelect?: (stop: Stop | null) => void;
}

export default function StopsLayer({
  selectedStopId = null,
  onStopSelect,
}: StopsLayerProps) {
  const map = useMap();
  const [stops, setStops] = useState<Stop[]>([]);
  const groupRef = useRef<L.LayerGroup | null>(null);
  const [revision, setRevision] = useState(0);
  const iconRef = useRef<L.DivIcon | null>(null);
  const selectedIconRef = useRef<L.DivIcon | null>(null);

  useEffect(() => {
    fetch("/api/stops")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: Stop[]) =>
        setStops((Array.isArray(data) ? data : []).filter(hasValidCoords)),
      )
      .catch(() => {});
  }, []);

  useEffect(() => {
    function update() {
      setRevision((r) => r + 1);
    }
    map.on("zoomend", update);
    map.on("moveend", update);
    return () => {
      map.off("zoomend", update);
      map.off("moveend", update);
    };
  }, [map]);

  useEffect(() => {
    if (!onStopSelect) return;
    function closeSelectedStop() {
      onStopSelect?.(null);
    }
    map.on("click", closeSelectedStop);
    return () => {
      map.off("click", closeSelectedStop);
    };
  }, [map, onStopSelect]);

  useEffect(() => {
    if (!groupRef.current) groupRef.current = L.layerGroup();
    const group = groupRef.current;
    group.clearLayers();

    const zoom = map.getZoom();
    if (zoom < MIN_ZOOM_FOR_STOPS || stops.length === 0) {
      group.remove();
      return;
    }

    if (!iconRef.current) iconRef.current = createStopIcon();
    if (!selectedIconRef.current)
      selectedIconRef.current = createStopIcon(true);

    const bounds = map.getBounds();

    for (const stop of stops) {
      const latlng = L.latLng(stop.stop_lat, stop.stop_lon);
      if (!bounds.contains(latlng)) continue;

      const marker = L.marker(latlng, {
        icon:
          selectedStopId === stop.stop_id
            ? selectedIconRef.current
            : iconRef.current,
        riseOnHover: true,
        bubblingMouseEvents: false,
      });
      marker.on("click", () => onStopSelect?.(stop));
      marker.addTo(group);
    }

    group.addTo(map);
  }, [stops, map, revision, selectedStopId, onStopSelect]);

  return null;
}
