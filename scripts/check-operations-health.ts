import { probeOperationsHealth } from "../lib/operations-health-probe.ts";
import { appendOperationsHealthHeartbeat } from "../lib/operations-health-heartbeat.ts";

const body = await probeOperationsHealth({
  secret: process.env.VAULT2077_HEALTH_SECRET ?? "",
  origin: process.env.VAULT2077_HEALTH_ORIGIN ?? "http://127.0.0.1:3000",
});
console.log(JSON.stringify({ status: body.status, checkedAt: body.checkedAt, checks: body.checks }));
const heartbeatFile = process.env.VAULT2077_HEALTH_HEARTBEAT_FILE?.trim();
if (heartbeatFile) {
  await appendOperationsHealthHeartbeat(heartbeatFile, {
    checkedAt: typeof body.checkedAt === "string" ? body.checkedAt : new Date().toISOString(),
  });
}
