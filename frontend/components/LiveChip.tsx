"use client";

export default function LiveChip() {
  return (
    <div className="fixed bottom-4 left-4 z-[800] flex items-center gap-2 rounded-full bg-secondary-container px-4 py-2 text-on-secondary-container shadow-[0_12px_24px_rgba(0,27,60,0.08)]">
      <span className="h-2 w-2 rounded-full bg-[#2e7d32] animate-[pulse-dot_1.5s_ease-in-out_infinite]" />
      <span className="text-xs font-semibold uppercase tracking-wide">Live</span>
    </div>
  );
}
