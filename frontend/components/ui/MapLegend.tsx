'use client'

const ITEMS = [
  { label: 'С рампа', color: '#22c55e', borderStyle: 'solid' },
  { label: 'Без рампа', color: '#6b7280', borderStyle: 'dashed' },
  { label: 'Няма данни', color: '#9ca3af', borderStyle: 'dotted' },
] as const

export default function MapLegend({ live = false }: { live?: boolean }) {
  return (
    <fieldset
      className="pointer-events-none fixed bottom-20 left-3 z-[600] rounded-xl border px-2.5 py-2 shadow-[var(--shadow)] sm:bottom-8 sm:left-4 sm:px-3 sm:py-2.5"
      style={{ background: 'var(--surface-overlay)', borderColor: 'var(--border)' }}
      aria-label="Легенда за достъпността на превозните средства"
    >
      <legend
        className="mb-1 text-[10px] font-semibold sm:mb-1.5 sm:text-[11px]"
        style={{ color: 'var(--text-secondary)' }}
      >
        Достъпност
      </legend>
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 sm:gap-3">
        <span
          className="flex items-center gap-1 text-[10px] font-semibold sm:text-[11px]"
          style={{ color: live ? '#22c55e' : 'var(--text-secondary)' }}
        >
          <span
            aria-hidden="true"
            className="h-1.5 w-1.5 rounded-full"
            style={{ background: live ? '#22c55e' : '#9ca3af' }}
          />
          {live ? 'На живо' : 'Свързване…'}
        </span>
        {ITEMS.map((item) => (
          <span
            key={item.label}
            className="flex items-center gap-1 text-[10px] sm:gap-1.5 sm:text-[11px]"
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
