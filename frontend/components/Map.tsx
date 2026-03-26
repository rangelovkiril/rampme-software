"use client";

import { useState } from "react";
import { MapContainer, TileLayer } from "react-leaflet";
import TopBar from "./TopBar";
import SidePanel from "./SidePanel";
import MapControls from "./MapControls";
import LiveChip from "./LiveChip";

export default function Map() {
  const [activePanel, setActivePanel] = useState<string | null>(null);

  function togglePanel(name: string) {
    setActivePanel((prev) => (prev === name ? null : name));
  }

  return (
    <div className="relative h-full w-full">
      <TopBar activePanel={activePanel} onTogglePanel={togglePanel} />

      <div className="absolute inset-0 top-[60px]">
        <MapContainer
          center={[42.6977, 23.3219]}
          zoom={13}
          zoomControl={false}
          attributionControl={false}
          className="h-full w-full"
        >
          <TileLayer url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png" />
          <MapControls />
        </MapContainer>
      </div>

      <SidePanel
        activePanel={activePanel}
        onClose={() => setActivePanel(null)}
      />
      <LiveChip />
    </div>
  );
}
