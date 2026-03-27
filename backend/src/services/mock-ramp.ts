import { config } from '../config'

const cache = new Map<string, boolean>()

export function hasMockRamp(key: string): boolean {
  if (!config.mockRamp) return false
  if (!cache.has(key)) cache.set(key, Math.random() < 0.5)
  return cache.get(key)!
}
