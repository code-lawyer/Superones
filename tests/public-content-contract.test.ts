import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = process.cwd();

test("public methodology follows the current cadence, correction, and ranking contracts", async () => {
  const methodology = await readFile(path.join(root, "app", "methodology", "page.tsx"), "utf8");

  assert.match(methodology, /白天每两个小时/);
  assert.match(methodology, /保留平台公开定义的顺序/);
  assert.match(methodology, /不可变/);
  assert.doesNotMatch(methodology, /06:00、12:00、18:00、24:00|24 小时和 7 天 Star|系统不会主动重审/);
});

test("internal pipeline topology is absent from public routes and browser DTOs", async () => {
  const [sourcePage, sourceExplorer, sourceTypes, pipelinePage, robots] = await Promise.all([
    readFile(path.join(root, "app", "sources", "page.tsx"), "utf8"),
    readFile(path.join(root, "app", "sources", "source-catalog-explorer.tsx"), "utf8"),
    readFile(path.join(root, "lib", "source-catalog-types.ts"), "utf8"),
    readFile(path.join(root, "app", "pipeline", "page.tsx"), "utf8"),
    readFile(path.join(root, "app", "robots.ts"), "utf8"),
  ]);

  await assert.rejects(access(path.join(root, "app", "sources", "pipeline", "page.tsx")));
  assert.doesNotMatch(
    [sourcePage, sourceExplorer, sourceTypes].join("\n"),
    /sources\/pipeline|endpointUrl|registryRevision|methodId|methodLabel|SourceCatalogMethod|xRunnableCandidates|xExcludedFromRuntime|xDuplicateDiscoveriesMerged/,
  );
  assert.doesNotMatch(pipelinePage, /href="\/sources\/pipeline"/);
  assert.doesNotMatch(robots, /sources\/pipeline/);
});

test("public source and feed copy contain no retired community contract", async () => {
  const [sourceExplorer, sourceBuilder, feedPage] = await Promise.all([
    readFile(path.join(root, "app", "sources", "source-catalog-explorer.tsx"), "utf8"),
    readFile(path.join(root, "lib", "source-catalog-builder.ts"), "utf8"),
    readFile(path.join(root, "app", "feed", "page.tsx"), "utf8"),
  ]);

  assert.doesNotMatch([sourceExplorer, sourceBuilder, feedPage].join("\n"), /Hacker News 与 Lobsters|社区原生条目|个人与社区|个人或社区/);
});

test("SiC route reads one aggregate content snapshot and platform rankings in parallel", async () => {
  const [page, content, store] = await Promise.all([
    readFile(path.join(root, "app", "sic", "page.tsx"), "utf8"),
    readFile(path.join(root, "lib", "sic-content.ts"), "utf8"),
    readFile(path.join(root, "lib", "sic-content-store.ts"), "utf8"),
  ]);

  assert.match(page, /getCachedSicContent\(\)/);
  assert.match(page, /getCachedDirectRankingBoards\(\)/);
  assert.match(page, /Promise\.all/);
  assert.match(page, /documentsSupplementUnavailable=\{publicContent\.unavailable\}/);
  assert.doesNotMatch(page, /getCachedSicContentGroup|parseSicView/);
  assert.match(content, /getSicStoredContentGroup\(group\)/);
  assert.doesNotMatch(content, /getSicContent\(\);/);
  assert.match(store, /jsonb_array_elements\(document->'items'\)/);
  assert.match(store, /item->>'group'.*= \$2/);
});
