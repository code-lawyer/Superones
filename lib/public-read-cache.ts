import "server-only";

import { unstable_cache } from "next/cache";
import {
  FRONTIER_PUBLIC_RANKING_CACHE_TAG,
  FRONTIER_PUBLIC_SNAPSHOT_CACHE_TAG,
  PUBLISHED_SERVICE_CATALOG_CACHE_TAG,
} from "./cache-tags";
import { getDirectRankingBoards } from "./direct-rankings";
import {
  latestRankingUpdate,
  listPublicRankings,
} from "./frontier/rankings";
import { listPublicPrizePool } from "./frontier/prizes";
import { listSeasonHistory } from "./frontier/season";
import { readPublishedServiceCatalog } from "./managed-service-catalog";
import { getPublicContentIndex } from "./public-content";
import { getSicContent } from "./sic-content";

/**
 * Public pages may remain request-rendered while their shared, read-only data is
 * reused briefly. TTLs are deliberately short so updates made by a separate
 * worker process become visible without relying on in-process invalidation.
 */
export const getCachedPublicContent = unstable_cache(
  getPublicContentIndex,
  ["public-content-index-v2"],
  { revalidate: 30, tags: ["public-content"] },
);

export const getCachedDirectRankingBoards = unstable_cache(
  getDirectRankingBoards,
  ["direct-ranking-boards"],
  { revalidate: 300, tags: ["direct-ranking-boards"] },
);

export const getCachedSicContent = unstable_cache(
  getSicContent,
  ["sic-content"],
  { revalidate: 60, tags: ["sic-content"] },
);

export const getCachedPublishedServiceCatalog = unstable_cache(
  readPublishedServiceCatalog,
  [PUBLISHED_SERVICE_CATALOG_CACHE_TAG, "catalog-v2"],
  { revalidate: 60, tags: [PUBLISHED_SERVICE_CATALOG_CACHE_TAG] },
);

export const getCachedFrontierSnapshot = unstable_cache(
  async (season: string) => {
    const [rankings, updatedAt, prizes, history] = await Promise.all([
      listPublicRankings(season),
      latestRankingUpdate(season),
      listPublicPrizePool(season),
      listSeasonHistory(),
    ]);
    return { rankings, updatedAt, prizes, history };
  },
  [FRONTIER_PUBLIC_SNAPSHOT_CACHE_TAG],
  { revalidate: 30, tags: [FRONTIER_PUBLIC_SNAPSHOT_CACHE_TAG] },
);

export const getCachedFrontierRanking = unstable_cache(
  async (season: string) => {
    const [rankings, updatedAt] = await Promise.all([
      listPublicRankings(season),
      latestRankingUpdate(season),
    ]);
    return { rankings, updatedAt };
  },
  [FRONTIER_PUBLIC_RANKING_CACHE_TAG],
  { revalidate: 30, tags: [FRONTIER_PUBLIC_RANKING_CACHE_TAG] },
);
