"use client";

import { useMap } from "react-leaflet";

export default function MapControls() {
  const map = useMap();

  return (
    <div className="absolute right-4 bottom-4 z-[800] flex flex-col gap-1">
      <ControlButton onClick={() => map.zoomIn()} title="Zoom in">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </ControlButton>
      <ControlButton onClick={() => map.zoomOut()} title="Zoom out">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </ControlButton>
      <ControlButton
        onClick={() => map.locate({ setView: true, maxZoom: 16 })}
        title="My location"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="4" />
          <line x1="12" y1="2" x2="12" y2="6" />
          <line x1="12" y1="18" x2="12" y2="22" />
          <line x1="2" y1="12" x2="6" y2="12" />
          <line x1="18" y1="12" x2="22" y2="12" />
        </svg>
      </ControlButton>
    </div>
  );
}

function ControlButton({
  onClick,
  title,
  children,
}: {
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-lg bg-surface-lowest text-primary shadow-[0_12px_24px_rgba(0,27,60,0.08)] transition-all hover:bg-surface-highest active:scale-95"
    >
      {children}
    </button>
  );
}
