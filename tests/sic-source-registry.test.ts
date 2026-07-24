import assert from "node:assert/strict";
import test from "node:test";
import { listApprovedSicSources, listSicSources } from "../lib/sic-source-registry.ts";

test("SiC source registry contains the approved fixed source catalog", () => {
  const sources = listSicSources();
  assert.equal(sources.length, 27);
  assert.equal(sources.filter((source) => source.group === "papers").length, 2);
  assert.equal(sources.filter((source) => source.group === "archive").length, 12);
  assert.equal(sources.filter((source) => source.group === "courses").length, 8);
  assert.equal(sources.filter((source) => source.group === "podcasts").length, 5);
  assert.equal(listApprovedSicSources().length, sources.length);
  assert.ok(sources.every((source) => source.rationale.length > 0));
  assert.ok(sources.every((source) => source.endpoint.startsWith("https://")));
});
