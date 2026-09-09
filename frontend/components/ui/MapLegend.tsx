'use client'

const ITEMS = [
  { label: 'С рампа', color: '#22c55e', borderStyle: 'solid' },
  { label: 'Без рампа', color: '#6b7280', borderStyle: 'dashed' },
  { label: 'Няма данни', color: '#9ca3af', borderStyle: 'dotted' },
] as const

export default function MapLegend() {
  return (
    <fieldset
      className="pointer-events-none fixed bottom-8 left-4 z-[600] hidden rounded-xl border px-3 py-2.5 shadow-[var(--shadow)] sm:block"
      style={{ background: 'var(--surface-overlay)', borderColor: 'var(--border)' }}
      aria-label="Легенда за достъпността на превозните средства"
    >
      <legend
        className="mb-1.5 text-[11px] font-semibold"
        style={{ color: 'var(--text-secondary)' }}
      >
        Достъпност
      </legend>
      <div className="flex items-center gap-3">
        {ITEMS.map((item) => (
          <span
            key={item.label}
            className="flex items-center gap-1.5 text-[11px]"
            style={{ color: 'var(--text)' }}
          >
            <span
              aria-hidden="true"
              className="h-3 w-3 rounded-full"
              style={{ border: `2px ${item.borderStyle} ${item.color}` }}
            />
            {item.label}
          </span>
        ))}
      </div>
    </fieldset>
  )
}
