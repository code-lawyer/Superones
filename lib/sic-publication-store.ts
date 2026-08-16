import "server-only";

import {
  configuredPostgresWriter,
  persistenceMode,
} from "./state-document-store.ts";
import {
  sicContentIdentityKey,
  sicContentProjectionDigest,
} from "./sic-content-identity.ts";
import type { SicContentItem } from "./sic-content-types.ts";
import type { SicContentGroupId } from "./sic-content-types.ts";

export type SicSourceSnapshot = { snapshotId: string; collectedAt: string };

let schemaAvailable: boolean | undefined;

export function requiresFullSicPublicationReconciliation(input: {
  existingProjectionDigest: string | null;
  existingActiveProjectionDigest: string;
  previousProjectionDigest?: string;
  replaceAll?: boolean;
}) {
  return Boolean(input.replaceAll)
    || input.existingProjectionDigest === null
    || input.existingProjectionDigest !== input.previousProjectionDigest
    || input.existingActiveProjectionDigest !== input.previousProjectionDigest;
}

async function activeNormalizedItems() {
  const result = await (await configuredPostgresWriter()).query<{ item: SicContentItem }>(
    `SELECT item
       FROM vault2077_sic_published_items
      WHERE active
      ORDER BY identity_key`,
  );
  return result.rows.map((row) => row.item);
}

async function hasPublicationSchema() {
  if (persistenceMode() !== "postgresql") return false;
  if (schemaAvailable !== undefined) return schemaAvailable;
  const result = await (await configuredPostgresWriter()).query<{ publications: string | null; meta: string | null }>(
    `SELECT
       to_regclass('public.vault2077_sic_published_items')::text AS publications,
       to_regclass('public.vault2077_sic_publication_meta')::text AS meta`,
  );
  schemaAvailable = Boolean(result.rows[0]?.publications && result.rows[0]?.meta);
  return schemaAvailable;
}

export async function readNormalizedSicPublications(
  legacyItems: SicContentItem[],
): Promise<SicContentItem[] | null> {
  if (!await hasPublicationSchema()) return null;
  const writer = await configuredPostgresWriter();
  const initialized = await writer.query<{ legacy_projection_digest: string }>(
    "SELECT legacy_projection_digest FROM vault2077_sic_publication_meta WHERE singleton = 1",
  );
  if (!initialized.rowCount) return null;
  if (initialized.rows[0].legacy_projection_digest !== sicContentProjectionDigest(legacyItems)) return null;
  const items = await activeNormalizedItems();
  if (sicContentProjectionDigest(items) !== sicContentProjectionDigest(legacyItems)) return null;
  return items.sort((left, right) => (
    Date.parse(right.collectedAt) - Date.parse(left.collectedAt)
      || sicContentIdentityKey(left).localeCompare(sicContentIdentityKey(right))
  ));
}

export async function syncNormalizedSicPublications(input: {
  items: SicContentItem[];
  changedItems?: SicContentItem[];
  sourceSnapshots: Record<string, SicSourceSnapshot>;
  previousProjectionDigest?: string;
  retiredIdentityKeys?: string[];
  authoritativeSourceIds?: string[];
  retiredSourceIds?: string[];
  replaceAll?: boolean;
}) {
  if (persistenceMode() !== "postgresql") return;
  if (!await hasPublicationSchema()) {
    throw new Error("SiC 逐条发布表尚未迁移；请先运行 npm run db:migrate。");
  }
  const writer = await configuredPostgresWriter();
  const now = new Date().toISOString();
  const identities = input.items.map((item) => sicContentIdentityKey(item));
  const existingMeta = await writer.query<{ legacy_projection_digest: string }>(
    "SELECT legacy_projection_digest FROM vault2077_sic_publication_meta WHERE singleton = 1",
  );
  const existingActiveProjectionDigest = sicContentProjectionDigest(await activeNormalizedItems());
  const requiresFullReconciliation = requiresFullSicPublicationReconciliation({
    existingProjectionDigest: existingMeta.rows[0]?.legacy_projection_digest ?? null,
    existingActiveProjectionDigest,
    previousProjectionDigest: input.previousProjectionDigest,
    replaceAll: input.replaceAll,
  });
  if (requiresFullReconciliation) {
    await writer.query(
      `UPDATE vault2077_sic_published_items
          SET active = false, retired_at = $2, last_published_at = $2
        WHERE active
          AND NOT (identity_key = ANY($1::text[]))`,
      [identities, now],
    );
  } else {
    const replaceSourceIds = [...new Set([
      ...(input.authoritativeSourceIds ?? []),
      ...(input.retiredSourceIds ?? []),
    ])];
    if (replaceSourceIds.length > 0) {
      await writer.query(
        `UPDATE vault2077_sic_published_items
            SET active = false, retired_at = $3, last_published_at = $3
          WHERE active
            AND source_id = ANY($1::text[])
            AND NOT (identity_key = ANY($2::text[]))`,
        [replaceSourceIds, identities, now],
      );
    }
    if ((input.retiredIdentityKeys?.length ?? 0) > 0) {
      await writer.query(
        `UPDATE vault2077_sic_published_items
            SET active = false, retired_at = $2, last_published_at = $2
          WHERE active
            AND identity_key = ANY($1::text[])`,
        [input.retiredIdentityKeys, now],
      );
    }
  }
  const itemsToUpsert = requiresFullReconciliation
    ? input.items
    : input.changedItems ?? input.items;
  for (const item of itemsToUpsert) {
    const snapshot = input.sourceSnapshots[item.sourceId] ?? {
      snapshotId: `legacy:${item.collectedAt}`,
      collectedAt: item.collectedAt,
    };
    await writer.query(
      `INSERT INTO vault2077_sic_published_items (
         identity_key, source_id, content_group, item, source_snapshot_id,
         source_collected_at, active, first_published_at, last_published_at, retired_at
       ) VALUES ($1, $2, $3, $4::jsonb, $5, $6, true, $7, $7, NULL)
       ON CONFLICT (identity_key) DO UPDATE SET
         source_id = EXCLUDED.source_id,
         content_group = EXCLUDED.content_group,
         item = EXCLUDED.item,
         source_snapshot_id = EXCLUDED.source_snapshot_id,
         source_collected_at = EXCLUDED.source_collected_at,
         active = true,
         last_published_at = EXCLUDED.last_published_at,
         retired_at = NULL`,
      [
        sicContentIdentityKey(item),
        item.sourceId,
        item.group,
        JSON.stringify(item),
        snapshot.snapshotId,
        snapshot.collectedAt,
        now,
      ],
    );
  }
  await writer.query(
    `INSERT INTO vault2077_sic_publication_meta (
       singleton, legacy_projection_digest, initialized_at, updated_at
     ) VALUES (1, $1, $2, $2)
     ON CONFLICT (singleton) DO UPDATE SET
       legacy_projection_digest = EXCLUDED.legacy_projection_digest,
       updated_at = EXCLUDED.updated_at`,
    [sicContentProjectionDigest(input.items), now],
  );
}

export async function normalizedSicPublicationStatus(legacyItems: SicContentItem[]) {
  const legacyActiveByGroup = { papers: 0, documents: 0, courses: 0, podcasts: 0 } satisfies Record<SicContentGroupId, number>;
  for (const item of legacyItems) legacyActiveByGroup[item.group] += 1;
  if (persistenceMode() !== "postgresql") {
    return { initialized: false, aligned: true, activeCount: legacyItems.length, activeByGroup: legacyActiveByGroup };
  }
  if (!await hasPublicationSchema()) {
    return { initialized: false, aligned: false, activeCount: 0, activeByGroup: legacyActiveByGroup };
  }
  const writer = await configuredPostgresWriter();
  const result = await writer.query<{
    legacy_projection_digest: string | null;
    active_count: string;
  }>(
    `SELECT meta.legacy_projection_digest,
            count(items.identity_key) FILTER (WHERE items.active)::text AS active_count
       FROM vault2077_sic_publication_meta AS meta
       LEFT JOIN vault2077_sic_published_items AS items ON true
      WHERE meta.singleton = 1
      GROUP BY meta.legacy_projection_digest`,
  );
  const row = result.rows[0];
  const activeItems = await activeNormalizedItems();
  const groups = await writer.query<{ content_group: SicContentGroupId; count: string }>(
    `SELECT content_group, count(*)::text AS count
       FROM vault2077_sic_published_items
      WHERE active
      GROUP BY content_group`,
  );
  const activeByGroup = { papers: 0, documents: 0, courses: 0, podcasts: 0 } satisfies Record<SicContentGroupId, number>;
  for (const group of groups.rows) activeByGroup[group.content_group] = Number(group.count);
  return {
    initialized: Boolean(row),
    aligned: row?.legacy_projection_digest === sicContentProjectionDigest(legacyItems)
      && sicContentProjectionDigest(activeItems) === sicContentProjectionDigest(legacyItems),
    activeCount: Number(row?.active_count ?? 0),
    activeByGroup,
  };
}
