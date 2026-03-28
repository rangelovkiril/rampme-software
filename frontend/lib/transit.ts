export interface RouteTypeMeta {
  label: string
  color: string
}

export const ROUTE_TYPE_CONFIG: Record<number, RouteTypeMeta> = {
  0: { label: 'Трамвай', color: '#F7941D' },
  1: { label: 'Метро', color: '#9B59B6' },
  3: { label: 'Автобус', color: '#BE1E2D' },
  11: { label: 'Тролей', color: '#27AAE1' },
}

export const DEFAULT_ROUTE_COLOR = '#BE1E2D'

/** Display order for route type filter chips and listings */
export const ROUTE_TYPE_ORDER = [3, 0, 11, 1] as const

export function getRouteColor(routeType: number | null | undefined): string {
  if (routeType == null) return DEFAULT_ROUTE_COLOR
  return ROUTE_TYPE_CONFIG[routeType]?.color ?? DEFAULT_ROUTE_COLOR
}

export function getRouteLabel(routeType: number | null | undefined): string {
  if (routeType == null) return 'Друго'
  return ROUTE_TYPE_CONFIG[routeType]?.label ?? 'Друго'
}

export function formatEta(minutes?: number): string {
  if (typeof minutes !== 'number' || !Number.isFinite(minutes)) return 'Скоро'
  if (minutes <= 0) return 'Сега'
  return `${minutes} мин`
}
