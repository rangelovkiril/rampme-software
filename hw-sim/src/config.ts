function positiveInt(name: string, envValue: string | undefined, fallback: number): number {
  if (envValue === undefined) return fallback
  const n = Number(envValue)
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(`${name} must be a positive integer, got ${JSON.stringify(envValue)}`)
  }
  return n
}

export const config = {
  mqttPort: positiveInt('MQTT_PORT', process.env.MQTT_PORT, 1883),
  httpPort: positiveInt('PORT', process.env.PORT, 4000),
  deployStepDelayMs: positiveInt('DEPLOY_STEP_DELAY_MS', process.env.DEPLOY_STEP_DELAY_MS, 300),
} as const
