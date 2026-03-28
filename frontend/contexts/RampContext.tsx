'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'

// ── types ────────────────────────────────────────────────────────────────

export interface RampReservation {
  id: number
  session_id: string
  vehicle_id: string
  stop_id: string
  type: 'board' | 'alight'
  status: 'pending' | 'active' | 'done' | 'cancelled' | 'expired'
  created_at: number
  resolved_at: number | null
}

interface RampCtx {
  sessionId: string
  reservations: RampReservation[]
  lockedVehicleId: string | null
  lockedRouteShortName: string | null
  reserveBoard: (vehicleId: string, stopId: string, routeShortName?: string | null) => Promise<RampReservation | null>
  reserveAlight: (vehicleId: string, stopId: string) => Promise<RampReservation | null>
  cancel: (id: number) => Promise<boolean>
  isReserved: (vehicleId: string, stopId: string) => boolean
  refresh: () => Promise<void>
}

const Ctx = createContext<RampCtx | null>(null)

// ── session id ───────────────────────────────────────────────────────────

function getSessionId(): string {
  const KEY = 'rampme_session'
  try {
    let s = localStorage.getItem(KEY)
    if (s) return s
    s = crypto.randomUUID()
    localStorage.setItem(KEY, s)
    return s
  } catch {
    return crypto.randomUUID()
  }
}

// ── api helpers ──────────────────────────────────────────────────────────

const hdrs = (sid: string) => ({ 'Content-Type': 'application/json', 'X-Session-Id': sid })

async function apiReserve(
  sid: string, vehicleId: string, stopId: string, type: 'board' | 'alight',
): Promise<RampReservation | null> {
  try {
    const r = await fetch('/api/ramp/reserve', {
      method: 'POST', headers: hdrs(sid),
      body: JSON.stringify({ vehicle_id: vehicleId, stop_id: stopId, type }),
    })
    return r.ok ? await r.json() : null
  } catch { return null }
}

async function apiCancel(sid: string, id: number): Promise<boolean> {
  try {
    const r = await fetch(`/api/ramp/reserve/${id}`, {
      method: 'DELETE', headers: { 'X-Session-Id': sid },
    })
    return r.ok
  } catch { return false }
}

async function apiFetch(sid: string): Promise<RampReservation[]> {
  try {
    const r = await fetch('/api/ramp/session', { headers: { 'X-Session-Id': sid } })
    return r.ok ? await r.json() : []
  } catch { return [] }
}

// ── provider ─────────────────────────────────────────────────────────────

export function RampProvider({ children }: { children: ReactNode }) {
  const [sid] = useState(getSessionId)
  const [reservations, setReservations] = useState<RampReservation[]>([])
  const [lockedVehicleId, setLockedVehicleId] = useState<string | null>(null)
  const [lockedRouteShortName, setLockedRouteShortName] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)
  const prevReservations = useRef<RampReservation[]>([])

  const refresh = useCallback(async () => {
    const data = await apiFetch(sid)

    // Log status transitions: pending → active (bus arrived) or active → done (bus left)
    for (const prev of prevReservations.current) {
      const curr = data.find((r) => r.id === prev.id)
      if (curr && curr.status !== prev.status) {
        if (curr.status === 'active') {
          console.log(`[ramp] bus arrived at stop — ${prev.type} reservation #${prev.id} is now ACTIVE (vehicle ${prev.vehicle_id}, stop ${prev.stop_id})`)
        } else if (curr.status === 'done') {
          console.log(`[ramp] ramp used — ${prev.type} reservation #${prev.id} DONE (vehicle ${prev.vehicle_id}, stop ${prev.stop_id})`)
        }
      }
      // Reservation disappeared from active list (removed server-side)
      if (!curr && (prev.status === 'pending' || prev.status === 'active')) {
        console.log(`[ramp] reservation #${prev.id} removed (${prev.type}, vehicle ${prev.vehicle_id})`)
      }
    }

    prevReservations.current = data
    setReservations(data)
    const board = data.find(
      (r) => r.type === 'board' && (r.status === 'pending' || r.status === 'active'),
    )
    setLockedVehicleId(board?.vehicle_id ?? null)
    const hasActiveAlight = data.some(
      (r) => r.type === 'alight' && (r.status === 'pending' || r.status === 'active'),
    )
    if (!board && !hasActiveAlight) setLockedRouteShortName(null)
  }, [sid])

  useEffect(() => {
    refresh()
    timer.current = setInterval(refresh, 10_000)
    return () => { if (timer.current) clearInterval(timer.current) }
  }, [refresh])

  const reserveBoard = useCallback(async (vid: string, stopId: string, routeShortName?: string | null) => {
    const r = await apiReserve(sid, vid, stopId, 'board')
    if (r) {
      console.log(`[ramp] board reserved — vehicle ${vid}, stop ${stopId}, reservation #${r.id}`)
      if (routeShortName != null) setLockedRouteShortName(routeShortName)
      setLockedVehicleId(vid)
      setReservations(prev => [...prev.filter(p => p.id !== r.id), r])
      await refresh()
    }
    return r
  }, [sid, refresh])

  const reserveAlight = useCallback(async (vid: string, stopId: string) => {
    const r = await apiReserve(sid, vid, stopId, 'alight')
    if (r) {
      console.log(`[ramp] alight reserved — vehicle ${vid}, stop ${stopId}, reservation #${r.id}`)
      setReservations(prev => [...prev.filter(p => p.id !== r.id), r])
      await refresh()
    }
    return r
  }, [sid, refresh])

  const cancel = useCallback(async (id: number) => {
    const ok = await apiCancel(sid, id)
    if (ok) await refresh()
    return ok
  }, [sid, refresh])

  const isReserved = useCallback(
    (vid: string, stopId: string) =>
      reservations.some(
        (r) => r.vehicle_id === vid && r.stop_id === stopId &&
          (r.status === 'pending' || r.status === 'active'),
      ),
    [reservations],
  )

  return (
    <Ctx.Provider value={{
      sessionId: sid, reservations, lockedVehicleId, lockedRouteShortName,
      reserveBoard, reserveAlight, cancel, isReserved, refresh,
    }}>
      {children}
    </Ctx.Provider>
  )
}

export function useRamp() {
  const c = useContext(Ctx)
  if (!c) throw new Error('useRamp must be inside <RampProvider>')
  return c
}
