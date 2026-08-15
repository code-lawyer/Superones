import assert from "node:assert/strict";
import test from "node:test";
import { createSicPublicPaginationHandler } from "../lib/sic-public-pagination-handler.ts";

const EMPTY_SNAPSHOT = {
  content: {
    groups: { papers: [], documents: [], courses: [], podcasts: [] },
    state: { updatedAt: null, itemCount: 0, sourceCount: 0, stale: false },
    delayedSources: [],
  },
  snapshotIds: {
    papers: "0123456789abcdef01234567",
    documents: "123456789abcdef012345678",
    courses: "23456789abcdef0123456789",
    podcasts: "3456789abcdef0123456789a",
  },
  contentUnavailable: false,
  documentsSupplementUnavailable: false,
};

function request(query: string) {
  return new Request(`http://localhost/api/public/sic-content?${query}`);
}

test("SiC pagination marks every response as no-store", async () => {
  const handler = createSicPublicPaginationHandler(async () => EMPTY_SNAPSHOT);
  const response = await handler(request("group=invalid"));

  assert.equal(response.status, 400);
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("SiC pagination reports an unavailable aggregate snapshot as unavailable", async () => {
  const handler = createSicPublicPaginationHandler(async () => ({
    ...EMPTY_SNAPSHOT,
    contentUnavailable: true,
  }));
  const response = await handler(request("group=papers&offset=0&snapshot=0123456789abcdef01234567"));

  assert.equal(response.status, 503);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), { error: "更多 SiC 内容暂时无法读取，请稍后重试。" });
});

test("SiC pagination isolates an unavailable document supplement from other content groups", async () => {
  const handler = createSicPublicPaginationHandler(async () => ({
    ...EMPTY_SNAPSHOT,
    documentsSupplementUnavailable: true,
  }));
  const response = await handler(request("group=papers&offset=0&snapshot=0123456789abcdef01234567"));

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("SiC document pagination serves a signed partial snapshot when one document source is unavailable", async () => {
  const handler = createSicPublicPaginationHandler(async () => ({
    ...EMPTY_SNAPSHOT,
    documentsSupplementUnavailable: true,
  }));
  const response = await handler(request("group=documents&offset=0&snapshot=123456789abcdef012345678"));

  assert.equal(response.status, 200);
});

test("SiC document pagination reports unavailable instead of stale when a partial read cannot verify the requested snapshot", async () => {
  const handler = createSicPublicPaginationHandler(async () => ({
    ...EMPTY_SNAPSHOT,
    documentsSupplementUnavailable: true,
  }));
  const response = await handler(request("group=documents&offset=0&snapshot=abcdef0123456789abcdef01"));

  assert.equal(response.status, 503);
});

test("SiC document pagination fails closed when both document sources are unavailable", async () => {
  const handler = createSicPublicPaginationHandler(async () => ({
    ...EMPTY_SNAPSHOT,
    contentUnavailable: true,
    documentsSupplementUnavailable: true,
  }));
  const response = await handler(request("group=documents&offset=0&snapshot=123456789abcdef012345678"));

  assert.equal(response.status, 503);
});

test("SiC pagination reserves stale responses for a successfully read changed snapshot", async () => {
  const handler = createSicPublicPaginationHandler(async () => EMPTY_SNAPSHOT);
  const response = await handler(request("group=papers&offset=0&snapshot=abcdef0123456789abcdef01"));

  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), {
    error: "SiC 内容已更新，请刷新当前页面后继续。",
    stale: true,
  });
});
