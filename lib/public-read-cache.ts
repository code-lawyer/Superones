import "server-only";

import { unstable_cache } from "next/cache";
import { PUBLISHED_SERVICE_CATALOG_CACHE_TAG } from "./cache-tags";
import { getDirectRankingBoards } from "./direct-rankings";
import {
  latestRankingUpdate,
  listPublicPrizePool,
  listPublicRankings,
  listSeasonHistory,
} from "./frontier-store";
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
  [PUBLISHED_SERVICE_CATALOG_CACHE_TAG],
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
  ["frontier-public-snapshot"],
  { revalidate: 30, tags: ["frontier-public-snapshot"] },
);

export const getCachedFrontierRanking = unstable_cache(
  async (season: string) => {
    const [rankings, updatedAt] = await Promise.all([
      listPublicRankings(season),
      latestRankingUpdate(season),
    ]);
    return { rankings, updatedAt };
  },
  ["frontier-public-ranking"],
  { revalidate: 30, tags: ["frontier-public-ranking"] },
);
