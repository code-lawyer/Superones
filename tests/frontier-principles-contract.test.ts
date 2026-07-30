import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const canonicalPrinciples = "无组织、无纪律、无目标、无期限";

test("Frontier public surfaces and product contracts use one four-principles canon", async () => {
  const paths = [
    "PRODUCT.md",
    "CONTEXT.md",
    path.join("docs", "Vault2077-Frontier-Design-Spec.md"),
    path.join("components", "home-experience.tsx"),
    path.join("app", "frontier", "frontier-copy.tsx"),
  ];
  const contents = await Promise.all(paths.map((target) => readFile(path.join(root, target), "utf8")));

  for (const [index, content] of contents.entries()) {
    assert.ok(
      content.includes(canonicalPrinciples) || content.includes(canonicalPrinciples.replaceAll("、", " · ")),
      `${paths[index]} must use the canonical Frontier principle order`,
    );
    assert.doesNotMatch(content, /无期限[、 ·]无评审[、 ·]无组织[、 ·]无目标/);
  }
});

test("Frontier principle detail preserves ranking truth and keyboard focus", async () => {
  const [principles, styles] = await Promise.all([
    readFile(path.join(root, "app", "frontier", "frontier-principles.tsx"), "utf8"),
    readFile(path.join(root, "app", "institutional-frontier.css"), "utf8"),
  ]);

  assert.match(principles, /报名后净新增 Star 最大者/);
  assert.match(principles, /无纪律不等于取消报名资格/);
  assert.match(principles, /本站现已开放自主捐赠和随机奖励抽取/);
  assert.match(styles, /\.frontier-principle-copy__header h2:focus\s*\{[\s\S]*?outline:\s*2px solid var\(--carbon\)/);
  assert.doesNotMatch(styles, /\.frontier-principle-copy__header h2:focus\s*\{[\s\S]*?outline:\s*0/);
});
