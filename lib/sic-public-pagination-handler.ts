import { SIC_CONTENT_GROUP_IDS, type SicContentGroupId } from "./sic-content-types.ts";
import { sicPublicPage } from "./sic-public-projection.ts";
import type { SicContentByGroup } from "./sic-content.ts";

const PAGE_SIZE = 5;
const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

type SicPublicSnapshotReader = () => Promise<{
  content: { groups: SicContentByGroup };
  snapshotIds: Record<SicContentGroupId, string>;
  contentUnavailable: boolean;
  documentsSupplementUnavailable: boolean;
}>;

function requestedGroup(value: string | null): SicContentGroupId | null {
  return SIC_CONTENT_GROUP_IDS.find((group) => group === value) ?? null;
}

function requestedOffset(value: string | null) {
  if (!value || !/^\d{1,5}$/.test(value)) return null;
  const offset = Number(value);
  return Number.isSafeInteger(offset) ? offset : null;
}

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: NO_STORE_HEADERS });
}

function unavailableResponse() {
  return json({ error: "更多 SiC 内容暂时无法读取，请稍后重试。" }, 503);
}

export function createSicPublicPaginationHandler(
  readSnapshot: SicPublicSnapshotReader,
) {
  return async function handleSicPublicPagination(request: Request) {
    const url = new URL(request.url);
    const group = requestedGroup(url.searchParams.get("group"));
    const offset = requestedOffset(url.searchParams.get("offset"));
    const expectedSnapshot = url.searchParams.get("snapshot");
    if (!group || offset === null || !expectedSnapshot || !/^[a-f0-9]{24}$/.test(expectedSnapshot)) {
      return json({ error: "分页参数无效。" }, 400);
    }

    try {
      const snapshot = await readSnapshot();
      const requestedGroupUnavailable = group === "documents"
        ? snapshot.contentUnavailable && snapshot.documentsSupplementUnavailable
        : snapshot.contentUnavailable;
      if (requestedGroupUnavailable) {
        return unavailableResponse();
      }
      const currentSnapshotId = snapshot.snapshotIds[group];
      if (currentSnapshotId !== expectedSnapshot) {
        const requestedGroupPartiallyUnavailable = group === "documents"
          && (snapshot.contentUnavailable || snapshot.documentsSupplementUnavailable);
        if (requestedGroupPartiallyUnavailable) return unavailableResponse();
        return json({ error: "SiC 内容已更新，请刷新当前页面后继续。", stale: true }, 409);
      }
      return json(sicPublicPage(snapshot.content.groups, currentSnapshotId, group, offset, PAGE_SIZE));
    } catch (error) {
      console.error("Public SiC pagination failed", {
        errorType: error instanceof Error ? error.name : "unknown",
      });
      return unavailableResponse();
    }
  };
}
