"use client";

import { useEffect } from "react";

interface SidePanelProps {
  activePanel: string | null;
  onClose: () => void;
}

const panelContent: Record<string, { title: string; placeholder: string }> = {
  alerts: {
    title: "Известия",
    placeholder: "Известията ще се заредят от API данните.",
  },
  routes: {
    title: "Линии",
    placeholder: "Линиите ще се заредят от GTFS данните.",
  },
};

export default function SidePanel({ activePanel, onClose }: SidePanelProps) {
  const isOpen = activePanel !== null && activePanel in panelContent;
  const content = activePanel ? panelContent[activePanel] : null;

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape" && isOpen) onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [isOpen, onClose]);

  return (
    <aside
      className={`fixed top-[60px] bottom-0 left-0 z-[900] flex w-[380px] max-sm:w-full flex-col bg-surface-low transition-transform duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] ${
        isOpen ? "translate-x-0" : "-translate-x-full"
      }`}
    >
      {content && (
        <>
          {/* Header */}
          <div className="flex items-center justify-between bg-surface-lowest p-6">
            <h2 className="text-xl font-bold text-primary">{content.title}</h2>
            <button
              onClick={onClose}
              className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-lg text-on-surface-variant transition-colors hover:bg-surface-high"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-4">
            <div className="rounded-xl bg-surface-lowest p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">
                Зареждане...
              </p>
              <p className="mt-1 text-sm leading-relaxed text-on-surface-variant">
                {content.placeholder}
              </p>
            </div>
          </div>
        </>
      )}
    </aside>
  );
}
