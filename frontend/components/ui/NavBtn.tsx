"use client";

import type { ReactNode } from "react";

interface NavBtnProps {
  active: boolean;
  onClick: () => void;
  label: string;
  children: ReactNode;
}

export function NavBtn({ active, onClick, label, children }: NavBtnProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl py-2 text-sm font-semibold transition-all"
      style={{
        background: active ? "var(--primary)" : "var(--control-bg)",
        color: active ? "#fff" : "var(--text-secondary)",
        border: active ? "none" : "1px solid var(--border)",
      }}
    >
      {children}
      {label}
    </button>
  );
}
