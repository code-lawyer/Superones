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

test("source search clear returns keyboard focus to the persistent search field", async () => {
  const explorer = await readFile(path.join(root, "app", "sources", "source-catalog-explorer.tsx"), "utf8");

  assert.match(explorer, /const searchInputRef = useRef<HTMLInputElement>\(null\)/);
  assert.match(explorer, /function clearSearch\(\)[\s\S]*?setQuery\(""\)[\s\S]*?searchInputRef\.current\?\.focus\(\)/);
  assert.match(explorer, /id="source-search"[\s\S]*?ref=\{searchInputRef\}/);
  assert.match(explorer, /onClick=\{clearSearch\}/);
});

test("SiC progressive records are remounted when their content-group snapshot changes", async () => {
  const [groups, overview] = await Promise.all([
    readFile(path.join(root, "components", "sic-content-groups.tsx"), "utf8"),
    readFile(path.join(root, "components", "sic-overview.tsx"), "utf8"),
  ]);

  assert.match(groups, /<SicProgressiveRecords[\s\S]*?key=\{`\$\{group\.id\}:\$\{snapshotIds\[group\.id\]\}`\}/);
  assert.match(overview, /<SicProgressiveRecords[\s\S]*?key=\{`papers:\$\{snapshotIds\.papers\}`\}/);
});

test("field errors keep the documented danger text treatment inside form fields", async () => {
  const styles = await readFile(path.join(root, "app", "globals.css"), "utf8");

  assert.match(styles, /\.form-field \.form-error,\s*\n\.form-error\s*\{[\s\S]*?color:\s*var\(--danger\)[\s\S]*?font-size:\s*var\(--type-nav\)/);
});

test("SiC route reads one aggregate content snapshot and platform rankings in parallel", async () => {
  const [page, snapshot, groups, content, store] = await Promise.all([
    readFile(path.join(root, "app", "sic", "page.tsx"), "utf8"),
    readFile(path.join(root, "lib", "sic-public-snapshot.ts"), "utf8"),
    readFile(path.join(root, "components", "sic-content-groups.tsx"), "utf8"),
    readFile(path.join(root, "lib", "sic-content.ts"), "utf8"),
    readFile(path.join(root, "lib", "sic-content-store.ts"), "utf8"),
  ]);

  assert.match(page, /getPublicSicSnapshot\(\)/);
  assert.match(page, /getCachedDirectRankingBoards\(\)/);
  assert.match(page, /Promise\.all/);
  assert.match(page, /documentsSupplementUnavailable=\{sicSnapshot\.documentsSupplementUnavailable\}/);
  assert.doesNotMatch(page, /getCachedSicContentGroup|parseSicView/);
  assert.match(snapshot, /getCachedSicContent\(\)/);
  assert.match(snapshot, /getCachedPublicContent\(\)/);
  assert.match(groups, /items\.slice\(0, 4\)\.map\(toSicPublicRecord\)/);
  assert.match(content, /getSicStoredContent\(\)/);
  assert.doesNotMatch(content, /getSicStoredContentGroup/);
  assert.doesNotMatch(store, /jsonb_array_elements\(document->'items'\)/);
});

test("home page uses published facts and distinguishes read failures from empty business state", async () => {
  const [page, experience] = await Promise.all([
    readFile(path.join(root, "app", "page.tsx"), "utf8"),
    readFile(path.join(root, "components", "home-experience.tsx"), "utf8"),
  ]);
  assert.match(page, /getCachedPublishedServiceCatalog\(\)/);
  assert.doesNotMatch(page, /infrastructureServices|specialtyServices|rangerProfiles/);
  assert.match(page, /unavailable:/);
  assert.match(experience, /信息流读取失败/);
  assert.match(experience, /服务目录读取失败/);
  assert.match(experience, /学院内容读取失败/);
  assert.match(experience, /赛季榜单暂时无法更新/);
  assert.match(experience, /开放状态暂时无法确认/);
});
