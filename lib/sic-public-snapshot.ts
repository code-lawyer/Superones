import "server-only";

import { addPublishedDocuments } from "./sic-content.ts";
import { getCachedPublicContent, getCachedSicContent } from "./public-read-cache.ts";
import { sicPublicGroupSnapshotIds } from "./sic-public-projection.ts";

const EMPTY_CONTENT = {
  groups: { papers: [], documents: [], courses: [], podcasts: [] },
  state: { updatedAt: null, itemCount: 0, sourceCount: 0, stale: false },
  delayedSources: [],
} satisfies Awaited<ReturnType<typeof getCachedSicContent>>;

export async function getPublicSicSnapshot() {
  const [sicResult, publicContent] = await Promise.all([
    getCachedSicContent().then((value) => ({ value, unavailable: false }), () => ({
      value: EMPTY_CONTENT,
      unavailable: true,
    })),
    getCachedPublicContent().then(
      (value) => ({ value: value.information, unavailable: false }),
      () => ({ value: [], unavailable: true }),
    ),
  ]);
  const content = addPublishedDocuments(sicResult.value, publicContent.value);
  return {
    content,
    snapshotIds: sicPublicGroupSnapshotIds(content.groups),
    contentUnavailable: sicResult.unavailable,
    documentsSupplementUnavailable: publicContent.unavailable,
  };
}
