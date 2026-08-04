import { probeOperationsHealth } from "../lib/operations-health-probe.ts";

const body = await probeOperationsHealth({
  secret: process.env.VAULT2077_HEALTH_SECRET ?? "",
  origin: process.env.VAULT2077_HEALTH_ORIGIN ?? "http://127.0.0.1:3000",
});
console.log(JSON.stringify({ status: body.status, checkedAt: body.checkedAt, checks: body.checks }));
