import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildSourceCatalog } from "../lib/source-catalog-builder.ts";
import type { SicSource } from "../lib/sic-source-registry.ts";

const sourceBundle = JSON.parse(await readFile(new URL("../config/source-bundle.json", import.meta.url), "utf8"));
const sicRegistry = JSON.parse(await readFile(new URL("../config/sic-source-registry.json", import.meta.url), "utf8"));

function catalog() {
  return buildSourceCatalog(sourceBundle, sicRegistry.sources as SicSource[]);
}

function sourceCount(section: ReturnType<typeof catalog>["sections"][number]) {
  return section.sources.length;
}

test("source catalog mirrors every active acquisition registry", () => {
  const result = catalog();
  const counts = Object.fromEntries(result.sections.map((section) => [section.id, sourceCount(section)]));

  assert.equal(result.total, 77);
  assert.deepEqual(counts, {
    "information-flow": 16,
    roadside: 36,
    documents: 9,
    papers: 1,
    podcasts: 4,
    courses: 6,
    "sic-rankings": 5,
  });
});

test("source catalog exposes only the five supported SiC ranking views", () => {
  const rankings = catalog().sections.find((section) => section.id === "sic-rankings");
  const rankingIds = rankings?.sources.map((source) => source.id);

  assert.deepEqual(rankingIds, [
    "ranking:github:today",
    "ranking:github:week",
    "ranking:github:month",
    "ranking:hugging-face",
    "ranking:openrouter",
  ]);
  assert.ok(rankingIds?.every((id) => !id.includes("skills")));
});

test("source catalog links every SiC source to the canonical aggregate-page anchors", () => {
  const sicSections = catalog().sections.filter((section) => [
    "documents",
    "papers",
    "podcasts",
    "courses",
    "sic-rankings",
  ].includes(section.id));

  for (const source of sicSections.flatMap((section) => section.sources)) {
    assert.match(source.destinationHref, /^\/sic#sic-(?:papers|rankings|group-(?:documents|courses|podcasts))$/);
    assert.doesNotMatch(source.destinationHref, /[?&]view=/);
  }
});

test("source catalog exposes only identity, nature, destination, and original links", () => {
  const result = catalog();
  const sources = result.sections.flatMap((section) => section.sources);
  const identities = new Set(sources.map((source) => source.id));
  const podcasts = result.sections.find((section) => section.id === "podcasts");

  assert.equal(identities.size, sources.length);
  assert.equal(podcasts && sourceCount(podcasts), 4);

  for (const source of sources) {
    assert.ok(source.destinationHref.startsWith("/"));
    assert.ok(source.sourceUrl.startsWith("https://"));
    assert.notEqual(
      source.sourceUrl,
      sourceBundle.sources.find((candidate: { id: string; endpoint: string }) => candidate.id === source.id)?.endpoint,
    );
    assert.ok(source.nature.trim());
    assert.ok(source.evidenceLabel.trim());
    assert.equal("methodId" in source, false);
    assert.equal("methodLabel" in source, false);
    assert.equal("purpose" in source, false);
  }
});
