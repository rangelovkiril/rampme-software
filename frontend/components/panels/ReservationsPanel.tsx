'use client'

import { useRamp, type RampReservation } from '@/contexts/RampContext'

const STATUS_LABEL: Record<RampReservation['status'], string> = {
  pending: 'Изчакване',
  active: 'Активна',
  done: 'Приключена',
  cancelled: 'Отказана',
  expired: 'Изтекла',
}

const STATUS_COLOR: Record<RampReservation['status'], string> = {
  pending: '#f59e0b',
  active: '#22c55e',
  done: 'var(--text-muted)',
  cancelled: 'var(--text-muted)',
  expired: 'var(--text-muted)',
}

interface Props {
  onOpenVehicle?: (vehicleId: string) => void
}

export default function ReservationsPanel({ onOpenVehicle }: Props) {
  const { reservations, cancel } = useRamp()

  const active = reservations.filter((r) => r.status === 'pending' || r.status === 'active')
  const past = reservations.filter((r) => r.status === 'done' || r.status === 'cancelled' || r.status === 'expired')

  if (reservations.length === 0) {
    return (
      <p className="py-3 text-sm" style={{ color: 'var(--text-muted)' }}>
        Няма резервации.
      </p>
    )
  }

  return (
    <div className="space-y-4">
      {active.length > 0 && (
        <div className="space-y-2">
          {active.map((r) => (
            <ReservationCard key={r.id} r={r} onCancel={() => cancel(r.id)} onOpen={r.vehicle_id ? () => onOpenVehicle?.(r.vehicle_id) : undefined} />
          ))}
        </div>
      )}

      {past.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
            История
          </p>
          {past.map((r) => (
            <ReservationCard key={r.id} r={r} />
          ))}
        </div>
      )}
    </div>
  )
}

function ReservationCard({ r, onCancel, onOpen }: { r: RampReservation; onCancel?: () => void; onOpen?: () => void }) {
  const isPending = r.status === 'pending'
  const isActive = r.status === 'pending' || r.status === 'active'
  return (
    <div
      role={onOpen ? 'button' : undefined}
      tabIndex={onOpen ? 0 : undefined}
      onClick={onOpen}
      onKeyDown={onOpen ? (e) => e.key === 'Enter' && onOpen() : undefined}
      className="rounded-xl p-3 flex items-start justify-between gap-3"
      style={{
        background: 'var(--surface-elevated)',
        border: '1px solid var(--border)',
        cursor: onOpen ? 'pointer' : 'default',
      }}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className="rounded-full px-2 py-0.5 text-xs font-semibold"
            style={{ background: r.type === 'board' ? '#22c55e22' : '#3b82f622', color: r.type === 'board' ? '#22c55e' : '#3b82f6' }}
          >
            {r.type === 'board' ? 'Качване' : 'Слизане'}
          </span>
          <span className="text-xs font-semibold" style={{ color: STATUS_COLOR[r.status] }}>
            {STATUS_LABEL[r.status]}
          </span>
        </div>
        <p className="mt-1 text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>
          {r.vehicle_id}
        </p>
        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
          Спирка {r.stop_id}
        </p>
      </div>

      {onCancel && isPending && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onCancel() }}
          className="shrink-0 rounded-lg px-2 py-1 text-xs font-semibold cursor-pointer"
          style={{
            background: 'color-mix(in oklab, var(--control-bg) 80%, #ef4444 20%)',
            color: '#ef4444',
          }}
        >
          Отказ
        </button>
      )}
    </div>
  )
}
