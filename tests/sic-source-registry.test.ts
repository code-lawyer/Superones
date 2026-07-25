import assert from "node:assert/strict";
import test from "node:test";
import { listApprovedSicSources, listCollectableSicSources, listSicSources } from "../lib/sic-source-registry.ts";

test("SiC source registry contains the approved fixed source catalog", () => {
  const sources = listSicSources();
  assert.equal(sources.length, 34);
  assert.equal(sources.filter((source) => source.group === "papers").length, 2);
  assert.equal(sources.filter((source) => source.group === "documents").length, 16);
  assert.equal(sources.filter((source) => source.group === "courses").length, 8);
  assert.equal(sources.filter((source) => source.group === "podcasts").length, 8);
  assert.equal(listApprovedSicSources().length, 26);
  assert.equal(listCollectableSicSources().length, 26);
  assert.equal(sources.filter((source) => source.status === "retired").length, 7);
  assert.equal(sources.filter((source) => source.status === "pending_review").length, 1);
  assert.ok(sources.find((source) => source.id === "dair-ai-papers-of-the-week")?.statusReason);
  assert.ok(sources.every((source) => source.rationale.length > 0));
  assert.ok(sources.every((source) => source.endpoint.startsWith("https://")));
});
