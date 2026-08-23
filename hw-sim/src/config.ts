export const config = {
  mqttPort: Number(process.env.MQTT_PORT ?? 1883),
  httpPort: Number(process.env.PORT ?? 4000),
  deployStepDelayMs: Number(process.env.DEPLOY_STEP_DELAY_MS ?? 300),
} as const
