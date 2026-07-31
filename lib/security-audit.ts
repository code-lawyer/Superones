import "server-only";

import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { configuredPostgresPool, configuredPostgresWriter, persistenceMode } from "./state-document-store.ts";

export type AuditEvent = {
  actorHash: string;
  action: string;
  targetType: string;
  targetId: string;
  result: "success" | "rejected" | "failed";
  reason?: string;
  diff?: Record<string, unknown>;
};

export async function recordAuditEvent(event: AuditEvent) {
  if (persistenceMode() === "postgresql") {
    await (await configuredPostgresWriter()).query(
      `INSERT INTO vault2077_audit_log
       (actor_hash, action, target_type, target_id, result, reason, diff)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
      [
        event.actorHash,
        event.action,
        event.targetType,
        event.targetId,
        event.result,
        event.reason ?? null,
        JSON.stringify(event.diff ?? {}),
      ],
    );
    return;
  }
  const dataRoot = process.env.VAULT2077_DATA_DIR
    ? path.resolve(process.env.VAULT2077_DATA_DIR)
    : path.join(process.cwd(), "data");
  await mkdir(dataRoot, { recursive: true });
  await appendFile(
    path.join(dataRoot, "security-audit.jsonl"),
    `${JSON.stringify({ occurredAt: new Date().toISOString(), ...event })}\n`,
    { encoding: "utf8", flag: "a" },
  );
}

export async function loginThrottleState(clientHash: string) {
  if (persistenceMode() !== "postgresql") return { locked: false, failedAttempts: 0 };
  const result = await configuredPostgresPool().query<{
    failed_attempts: number;
    locked_until: Date | null;
  }>(
    "SELECT failed_attempts, locked_until FROM vault2077_login_throttle WHERE client_hash = $1",
    [clientHash],
  );
  const row = result.rows[0];
  return {
    locked: Boolean(row?.locked_until && row.locked_until.getTime() > Date.now()),
    failedAttempts: Number(row?.failed_attempts ?? 0),
  };
}

export async function recordLoginFailure(clientHash: string) {
  if (persistenceMode() !== "postgresql") return;
  await configuredPostgresPool().query(
    `INSERT INTO vault2077_login_throttle
       (client_hash, failed_attempts, window_started_at, locked_until, updated_at)
     VALUES ($1, 1, now(), NULL, now())
     ON CONFLICT (client_hash) DO UPDATE SET
       failed_attempts = CASE
         WHEN vault2077_login_throttle.window_started_at < now() - interval '1 hour' THEN 1
         ELSE vault2077_login_throttle.failed_attempts + 1
       END,
       window_started_at = CASE
         WHEN vault2077_login_throttle.window_started_at < now() - interval '1 hour' THEN now()
         ELSE vault2077_login_throttle.window_started_at
       END,
       locked_until = CASE
         WHEN (
           CASE
             WHEN vault2077_login_throttle.window_started_at < now() - interval '1 hour' THEN 1
             ELSE vault2077_login_throttle.failed_attempts + 1
           END
         ) >= 8 THEN now() + interval '30 minutes'
         ELSE vault2077_login_throttle.locked_until
       END,
       updated_at = now()`,
    [clientHash],
  );
}

export async function clearLoginFailures(clientHash: string) {
  if (persistenceMode() !== "postgresql") return;
  await configuredPostgresPool().query(
    "DELETE FROM vault2077_login_throttle WHERE client_hash = $1",
    [clientHash],
  );
}
