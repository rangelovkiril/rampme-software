/**
 * sim-hardware.ts — Simulates ramp hardware MQTT messages for local testing.
 *
 * Usage:
 *   bun scripts/sim-hardware.ts <vehicle_id> [--cycle]
 *
 * Examples:
 *   bun scripts/sim-hardware.ts 2148            # single "deployed" state
 *   bun scripts/sim-hardware.ts 2148 --cycle    # full deploying→deployed→done cycle
 */

import mqtt from "mqtt";

const vehicleId = process.argv[2];
if (!vehicleId) {
  console.error("Usage: bun scripts/sim-hardware.ts <vehicle_id> [--cycle]");
  process.exit(1);
}

const fullCycle = process.argv.includes("--cycle");

const url =
  process.env.MQTT_URL ??
  "mqtts://41c64ccf1f8b44b586875ee1756c1dfc.s1.eu.hivemq.cloud:8883";
const username = process.env.MQTT_USERNAME ?? "rampme";
const password = process.env.MQTT_PASSWORD ?? "superStr0ngPassWord";

const topic = `ramp/${vehicleId}/state`;

const client = await mqtt.connectAsync(url, { username, password });
console.log("[sim] connected");

function pub(state: string, reason?: string) {
  const payload = JSON.stringify({ state, ...(reason ? { reason } : {}) });
  client.publish(topic, payload, { qos: 1 });
  console.log(`[sim] → ${topic}  ${payload}`);
}

if (fullCycle) {
  pub("deploying");
  await Bun.sleep(2000);
  pub("deployed");
  await Bun.sleep(10000);
  pub("retracting");
  await Bun.sleep(2000);
  pub("done");
} else {
  pub("deployed");
}

await client.endAsync();
console.log("[sim] done");
