import "server-only";

import sicSourceRegistry from "../config/sic-source-registry.json" with { type: "json" };
import { acquisitionInboxHealth, acquisitionLaneFreshness } from "./acquisition-health.ts";
import { configuredAcquisitionReceiver } from "./acquisition-inbox.ts";
import { getStoredContent } from "./content-store.ts";
import { getDirectRankingBoards, getDirectRankingSourceReports } from "./direct-rankings.ts";
import { frontierObservationTaskStats } from "./frontier-public-tasks.ts";
import { loadEditorialProfileConfig, type EditorialProfileId } from "./openai-compatible-client.ts";
import { getSicStoredContent } from "./sic-content-store.ts";
import { configuredPostgresPool, persistenceMode } from "./state-document-store.ts";

type HealthCheck = {
  status: "ok" | "degraded";
  detail: string;
};

const INFORMATION_FLOW_MIN_ITEMS = 10;

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
      detail: `${config.primary.model}; fallback=${config.fallback ? "configured" : "none"}; budget=${config.maxRequestsPerRun ?? "unlimited"}`,
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
  const now = new Date();
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
        status: latestMigration === "0007_retire_online_payment_channel.sql" ? "ok" : "degraded",
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

  const [queue, content, sic, rankings, rankingReports, frontierTasks] = await Promise.all([
    safely(() => configuredAcquisitionReceiver().health()),
    safely(() => getStoredContent()),
    safely(() => getSicStoredContent()),
    safely(() => getDirectRankingBoards()),
    safely(() => getDirectRankingSourceReports()),
    safely(() => frontierObservationTaskStats()),
  ]);
  checks.inbox = queue
    ? acquisitionInboxHealth(queue, now)
    : { status: "degraded", detail: "inbox unavailable" };

  const contentAge = ageHours(content?.state.updatedAt ?? null);
  checks.vaultFreshness = {
    status: contentAge !== null && contentAge <= 12 ? "ok" : "degraded",
    detail: contentAge === null ? "no successful publication" : `${contentAge.toFixed(1)}h`,
  };
  const informationItems = content?.information.filter((item) => (
    (item.contentGroup ?? item.sourceStream ?? "information") === "information"
  )) ?? [];
  const informationSourceIds = new Set(informationItems.flatMap((item) => item.sourceChannelId ? [item.sourceChannelId] : []));
  const informationUpdatedAt = content
    ? Object.entries(content.sourceSnapshots)
        .filter(([sourceId, snapshot]) => (
          snapshot.contentGroup === "information"
          || (!snapshot.contentGroup && informationSourceIds.has(sourceId))
        ))
        .map(([, snapshot]) => snapshot.collectedAt)
        .sort((left, right) => Date.parse(right) - Date.parse(left))[0] ?? null
    : null;
  const informationAge = ageHours(informationUpdatedAt);
  const informationFreshness = acquisitionLaneFreshness({
    lane: "information",
    lastSuccessfulAt: informationUpdatedAt,
    now,
  });
  checks.informationFlow = {
    status: informationItems.length >= INFORMATION_FLOW_MIN_ITEMS
      && informationFreshness.status === "ok"
      ? "ok"
      : "degraded",
    detail: `count=${informationItems.length}; age=${informationAge === null ? "none" : `${informationAge.toFixed(1)}h`}; min=${INFORMATION_FLOW_MIN_ITEMS}; ${informationFreshness.detail}; received=${queue?.latestByLane.information?.lastReceivedAt ?? "none"}; processed=${queue?.latestByLane.information?.lastProcessedAt ?? "none"}`,
  };
  const roadsideUpdatedAt = content
    ? Object.values(content.sourceSnapshots)
        .filter((snapshot) => snapshot.contentGroup === "roadside")
        .map((snapshot) => snapshot.collectedAt)
        .sort((left, right) => Date.parse(right) - Date.parse(left))[0] ?? null
    : null;
  const roadsideFreshness = acquisitionLaneFreshness({
    lane: "roadside",
    lastSuccessfulAt: roadsideUpdatedAt,
    now,
  });
  checks.roadsideFlow = {
    status: roadsideFreshness.status,
    detail: `${roadsideFreshness.detail}; received=${queue?.latestByLane.roadside?.lastReceivedAt ?? "none"}; processed=${queue?.latestByLane.roadside?.lastProcessedAt ?? "none"}`,
  };
  const sicFreshness = acquisitionLaneFreshness({
    lane: "sic",
    lastSuccessfulAt: sic?.state.updatedAt ?? null,
    now,
  });
  checks.sicFreshness = {
    status: sicFreshness.status,
    detail: `${sicFreshness.detail}; received=${queue?.latestByLane.sic?.lastReceivedAt ?? "none"}; processed=${queue?.latestByLane.sic?.lastProcessedAt ?? "none"}`,
  };
  const approvedSicSourceIds = sicSourceRegistry.sources
    .filter((source) => source.status === "approved")
    .map((source) => source.id)
    .sort();
  const completedSicSourceIds = new Set(sic?.bootstrap.completedSourceIds ?? []);
  const missingSicSourceIds = approvedSicSourceIds.filter((sourceId) => !completedSicSourceIds.has(sourceId));
  checks.sicBootstrap = sic
    ? {
        status: missingSicSourceIds.length === 0 && sic.bootstrap.lastBootstrapAt ? "ok" : "degraded",
        detail: `coverage=${approvedSicSourceIds.length - missingSicSourceIds.length}/${approvedSicSourceIds.length}; missing=${missingSicSourceIds.join(",") || "none"}; run=${sic.bootstrap.runId ?? "unknown"}; lastMode=${sic.bootstrap.lastRunMode ?? "unknown"}; lastBootstrap=${sic.bootstrap.lastBootstrapAt ?? "unknown"}`,
      }
    : { status: "degraded", detail: "SiC bootstrap state unavailable" };
  const rankingUpdatedAt = rankings
    ?.map((board) => board.capturedAt)
    .sort((left, right) => Date.parse(right) - Date.parse(left))[0] ?? null;
  const rankingFreshness = acquisitionLaneFreshness({
    lane: "rankings",
    lastSuccessfulAt: rankingUpdatedAt,
    now,
  });
  checks.rankings = rankings
    ? {
        status: rankings.length > 0
          && rankings.every((board) => !board.stale)
          && (rankingReports ?? []).every((report) => !["failed", "partial"].includes(report.status))
          && rankingFreshness.status === "ok"
          ? "ok"
          : "degraded",
        detail: `${rankings.length} boards; stale=${rankings.filter((board) => board.stale).length}; failed=${(rankingReports ?? []).filter((report) => ["failed", "partial"].includes(report.status)).length}; ${rankingFreshness.detail}; received=${queue?.latestByLane.rankings?.lastReceivedAt ?? "none"}; processed=${queue?.latestByLane.rankings?.lastProcessedAt ?? "none"}`,
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
