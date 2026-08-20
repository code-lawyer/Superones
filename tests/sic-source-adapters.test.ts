import assert from "node:assert/strict";
import test from "node:test";
import { resolveSicSourceAdapter } from "../lib/sic-source-adapters.ts";
import { listSicSources } from "../lib/sic-source-registry.ts";

test("every registered SiC source resolves through one explicit adapter", () => {
  const sources = listSicSources();
  const resolved = new Map(sources.map((source) => [source.id, resolveSicSourceAdapter(source)]));
  assert.equal(resolved.size, sources.length);
  assert.equal(resolved.get("hugging-face-daily-papers"), "hugging-face-weekly");
  assert.ok([...resolved.values()].every((adapter) => [
    "hugging-face-weekly",
    "trusted-json-feed",
    "xml-feed",
    "github-commit-feed",
    "sitemap",
    "dated-index",
    "generic-html",
  ].includes(adapter)));
});

test("unknown SiC source kinds fail closed", () => {
  const source = listSicSources()[0];
  assert.throws(
    () => resolveSicSourceAdapter({ ...source, id: "unknown-source", kind: "misspelled-kind" } as unknown as typeof source),
    /没有已部署的采集适配器/,
  );
});
