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

test("Frontier principle detail preserves ranking truth and hardened interaction contracts", async () => {
  const [principles, dialog, styles] = await Promise.all([
    readFile(path.join(root, "app", "frontier", "frontier-principles.tsx"), "utf8"),
    readFile(path.join(root, "app", "frontier", "frontier-dialog.tsx"), "utf8"),
    readFile(path.join(root, "app", "institutional-frontier.css"), "utf8"),
  ]);

  assert.match(principles, /报名后净新增 Star 最大者/);
  assert.match(principles, /无纪律不等于取消报名资格/);
  assert.match(principles, /本站现已开放自主捐赠和随机奖励抽取/);
  assert.match(principles, /inert=\{active !== null\}/);
  assert.match(principles, /inert=\{active === null\}/);
  assert.doesNotMatch(principles, /max-width:\s*820px/);
  assert.match(principles, /principleDetail\.current\?\.scrollIntoView/);
  assert.doesNotMatch(principles, /className="frontier-doctrine-face frontier-doctrine-face--principle"[\s\S]*?aria-live=/);
  assert.match(dialog, /onCancel=\{cancel\}/);
  assert.match(dialog, /event\.target === event\.currentTarget/);
  assert.match(styles, /\.frontier-doctrine-face\[aria-hidden="true"\]\s*\{[\s\S]*?pointer-events:\s*none/);
  assert.match(styles, /\.frontier-doctrine-face--principle\s*\{[\s\S]*?scroll-margin-top:\s*78px/);
  assert.match(styles, /\.frontier-dialog__close\s*\{[\s\S]*?min-width:\s*44px[\s\S]*?min-height:\s*44px/);
  assert.match(styles, /\.frontier-principle-copy__header h2:focus\s*\{[\s\S]*?outline:\s*2px solid var\(--carbon\)/);
  assert.doesNotMatch(styles, /\.frontier-principle-copy__header h2:focus\s*\{[\s\S]*?outline:\s*0/);
});
