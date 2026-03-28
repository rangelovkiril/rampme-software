import { config } from '../config'
import { MOCK_BUS_ID } from './mock-bus'

const cache = new Map<string, boolean>()

export function hasMockRamp(key: string): boolean {
  // The mock bus always has a ramp — that's the whole point
  if (key === MOCK_BUS_ID) return true
  if (!config.mockRamp) return false
  if (!cache.has(key)) cache.set(key, Math.random() < 0.5)
  return cache.get(key)!
}
