import "server-only";

import { configuredAcquisitionReceiver } from "./acquisition-inbox.ts";
import { getStoredContent } from "./content-store.ts";
import { getDirectRankingBoards } from "./direct-rankings.ts";
import { frontierObservationTaskStats } from "./frontier-public-tasks.ts";
import { loadEditorialProfileConfig, type EditorialProfileId } from "./openai-compatible-client.ts";
import { getSicStoredContent } from "./sic-content-store.ts";
import { configuredPostgresPool, persistenceMode } from "./state-document-store.ts";

type HealthCheck = {
  status: "ok" | "degraded";
  detail: string;
};

function ageHours(value: string | null) {
  if (!value) return null;
  const age = (Date.now() - Date.parse(value)) / 3_600_000;
  return Number.isFinite(age) ? Math.max(0, age) : null;
}

function editorialCheck(profile: EditorialProfileId): HealthCheck {
  try {
    const config = loadEditorialProfileConfig(profile);
    return {
      status: "ok",
      detail: `${config.primary.model}; fallback=${config.fallback ? "configured" : "none"}; budget=${config.maxRequestsPerRun}`,
    };
  } catch (error) {
    return {
      status: "degraded",
      detail: error instanceof Error ? error.message : "配置无效",
    };
  }
}

async function safely<T>(operation: () => Promise<T>) {
  try {
    return await operation();
  } catch {
    return null;
  }
}

export async function getOperationsHealth() {
  const checks: Record<string, HealthCheck> = {};
  let mode: "postgresql" | "file-preview" | "unavailable" = "unavailable";
  try {
    mode = persistenceMode();
    if (mode === "postgresql") {
      const startedAt = Date.now();
      const migration = await configuredPostgresPool().query<{ name: string }>(
        `SELECT name
         FROM vault2077_schema_migrations
         ORDER BY name DESC
         LIMIT 1`,
      );
      const latestMigration = migration.rows[0]?.name ?? "none";
      checks.database = {
        status: latestMigration === "0005_admin_sessions.sql" ? "ok" : "degraded",
        detail: `latest=${latestMigration}; ${Date.now() - startedAt}ms`,
      };
    } else {
      checks.database = {
        status: process.env.NODE_ENV === "production" ? "degraded" : "ok",
        detail: "explicit file preview",
      };
    }
  } catch (error) {
    checks.database = {
      status: "degraded",
      detail: error instanceof Error ? error.message : "数据库不可用",
    };
  }

  const [queue, content, sic, rankings, frontierTasks] = await Promise.all([
    safely(() => configuredAcquisitionReceiver().stats()),
    safely(() => getStoredContent()),
    safely(() => getSicStoredContent()),
    safely(() => getDirectRankingBoards()),
    safely(() => frontierObservationTaskStats()),
  ]);
  checks.inbox = queue
    ? {
        status: queue.received > 20
          || queue.processing > 2
          || queue.quarantined > 0
          || queue.retryable > 20
          ? "degraded"
          : "ok",
        detail: `received=${queue.received}; processing=${queue.processing}; retryable=${queue.retryable}; quarantined=${queue.quarantined}`,
      }
    : { status: "degraded", detail: "inbox unavailable" };

  const contentAge = ageHours(content?.state.updatedAt ?? null);
  checks.vaultFreshness = {
    status: contentAge !== null && contentAge <= 4 ? "ok" : "degraded",
    detail: contentAge === null ? "no successful publication" : `${contentAge.toFixed(1)}h`,
  };
  const sicAge = ageHours(sic?.state.updatedAt ?? null);
  checks.sicFreshness = {
    status: sicAge !== null && sicAge <= 36 ? "ok" : "degraded",
    detail: sicAge === null ? "no successful publication" : `${sicAge.toFixed(1)}h`,
  };
  checks.rankings = rankings
    ? {
        status: rankings.length > 0 && rankings.every((board) => !board.stale) ? "ok" : "degraded",
        detail: `${rankings.length} boards; stale=${rankings.filter((board) => board.stale).length}`,
      }
    : { status: "degraded", detail: "rankings unavailable" };
  checks.frontierFallback = frontierTasks
    ? {
        status: frontierTasks.pending <= 20 ? "ok" : "degraded",
        detail: `pending=${frontierTasks.pending}; oldest=${frontierTasks.oldestRequestedAt ?? "none"}`,
      }
    : { status: "degraded", detail: "fallback queue unavailable" };
  checks.vaultEditorial = editorialCheck("vault_editorial");
  checks.sicEditorial = editorialCheck("sic_editorial");

  const status = Object.values(checks).every((check) => check.status === "ok")
    ? "ok"
    : "degraded";
  return {
    status,
    checkedAt: new Date().toISOString(),
    persistenceMode: mode,
    checks,
  };
}
