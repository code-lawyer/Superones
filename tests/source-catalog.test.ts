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
  return section.methods.reduce((total, method) => total + method.sources.length, 0);
}

test("source catalog mirrors every active acquisition registry", () => {
  const result = catalog();
  const counts = Object.fromEntries(result.sections.map((section) => [section.id, sourceCount(section)]));

  assert.equal(result.total, 235);
  assert.deepEqual(counts, {
    "information-flow": 201,
    "sic-library": 27,
    "sic-rankings": 7,
  });
});

test("source catalog keeps collection methods grouped and source identities unique", () => {
  const result = catalog();
  const sources = result.sections.flatMap((section) => section.methods.flatMap((method) => method.sources));
  const identities = new Set(sources.map((source) => source.id));
  const information = result.sections.find((section) => section.id === "information-flow");
  const sic = result.sections.find((section) => section.id === "sic-library");

  assert.equal(identities.size, sources.length);
  assert.equal(information?.methods.find((method) => method.id === "rss-atom")?.sources.length, 183);
  assert.equal(sic?.methods.find((method) => method.id === "rss-atom")?.sources.length, 16);

  for (const source of sources) {
    assert.ok(source.destinationHref.startsWith("/"));
    assert.ok(source.sourceUrl.startsWith("https://"));
    assert.ok(source.endpointUrl.startsWith("https://"));
    assert.ok(source.purpose.trim());
    assert.ok(source.nature.trim());
    assert.ok(source.evidenceLabel.trim());
    assert.ok(source.provenance.trim());
  }
});
