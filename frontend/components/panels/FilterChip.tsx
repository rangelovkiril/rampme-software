interface FilterChipProps {
  active: boolean
  onClick: () => void
  label: string
  color: string
}

export default function FilterChip({ active, onClick, label, color }: FilterChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full px-2.5 py-1 text-xs font-semibold transition-all"
      style={{
        background: active ? color : 'var(--surface-elevated)',
        color: active ? '#fff' : 'var(--text-secondary)',
        border: `1px solid ${active ? color : 'var(--border)'}`,
      }}
    >
      {label}
    </button>
  )
}
