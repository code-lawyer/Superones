import process from "node:process";
import { runFrontierTick } from "../lib/frontier-service.ts";
import { recordAuditEvent } from "../lib/security-audit.ts";
import { closePersistencePool } from "../lib/state-document-store.ts";

const startedAt = new Date().toISOString();
try {
  const result = await runFrontierTick();
  await recordAuditEvent({
    actorHash: "system:scheduler",
    action: "frontier.tick",
    targetType: "frontier",
    targetId: startedAt,
    result: "success",
    diff: {
      refreshed: result.refresh.refreshed,
      failed: result.refresh.failed,
      settledSeasons: result.settlements.length,
    },
  });
  console.log(JSON.stringify({ status: "ok", startedAt, result }, null, 2));
} catch (error) {
  await recordAuditEvent({
    actorHash: "system:scheduler",
    action: "frontier.tick",
    targetType: "frontier",
    targetId: startedAt,
    result: "failed",
    reason: error instanceof Error ? error.message.slice(0, 300) : String(error).slice(0, 300),
  }).catch(() => undefined);
  console.error(error);
  process.exitCode = 1;
} finally {
  await closePersistencePool();
}
