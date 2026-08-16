import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("SiC paper records preserve a readable title track when the desktop rail is constrained", async () => {
  const styles = await readFile(path.join(root, "app", "institutional-sic.css"), "utf8");

  assert.match(
    styles,
    /@media \(min-width:\s*821px\)[\s\S]*?\.sic-overview-papers \.sic-overview-record--compact summary\s*\{[\s\S]*?grid-template-columns:\s*42px minmax\(12ch,\s*1fr\) 40px;/,
  );
});

test("public content pages keep pipeline delay diagnostics out of the browser UI", async () => {
  const sicPublicSources = await Promise.all([
    path.join(root, "app", "page.tsx"),
    path.join(root, "app", "sic", "page.tsx"),
    path.join(root, "components", "home-experience.tsx"),
    path.join(root, "components", "sic-overview.tsx"),
    path.join(root, "components", "sic-content-groups.tsx"),
    path.join(root, "components", "sic-rankings.tsx"),
  ].map((file) => readFile(file, "utf8")));
  const feedPage = await readFile(path.join(root, "app", "feed", "page.tsx"), "utf8");

  assert.doesNotMatch(
    sicPublicSources.join("\n"),
    /更新延迟|上一成功快照|读取失败|服务降级|暂时无法更新|暂时无法确认|delayedSources|board\.stale|sicContent\.state\.stale|data\.unavailable/,
  );
  assert.doesNotMatch(feedPage, /更新延迟/);
});
