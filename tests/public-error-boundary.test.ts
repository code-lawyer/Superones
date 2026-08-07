import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const routes = [
  "app/api/internal/frontier/tasks/route.ts",
  "app/api/frontier/donations/route.ts",
  "app/api/frontier/verify/route.ts",
  "app/api/corrections/route.ts",
] as const;

test("infrastructure failures do not expose raw exception messages", async () => {
  for (const route of routes) {
    const source = await readFile(new URL(`../${route}`, import.meta.url), "utf8");
    assert.doesNotMatch(
      source,
      /error:\s*error instanceof Error \? error\.message/,
      route,
    );
    assert.match(source, /console\.error\(/, route);
  }
});

test("Frontier challenge only returns known conflict messages", async () => {
  const source = await readFile(
    new URL("../app/api/frontier/challenge/route.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /error instanceof FrontierSubmissionConflictError/);
  assert.match(source, /\{ error: error\.message, code: error\.code \}/);
  assert.doesNotMatch(source, /message\.includes\("(?:已经|获奖)"\)/);
  assert.match(source, /Frontier repository challenge creation failed/);
  assert.match(source, /\{ error: "暂时无法创建验证文件。" \}/);
});
