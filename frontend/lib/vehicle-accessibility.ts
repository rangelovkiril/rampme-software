import type { RampStatus } from '@backend/schemas'

export function getVehicleAccessibility(status: RampStatus | null | undefined) {
  if (status === 'working' || status === 'in_use') {
    return { text: 'С рампа', color: '#22c55e', icon: 'check' as const }
  }
  if (status === 'no_ramp') {
    return { text: 'Без рампа', color: '#9ca3af', icon: 'minus' as const }
  }
  return { text: 'Достъпност неизвестна', color: '#9ca3af', icon: 'question' as const }
}
