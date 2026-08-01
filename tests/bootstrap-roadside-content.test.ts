import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

type BootstrapInformation = {
  slug?: string;
  originContentId?: string;
  originalContent?: string;
  translatedContent?: string;
};

async function bootstrapInformation() {
  const store = JSON.parse(await readFile(
    path.join(process.cwd(), "data", "bootstrap", "content-store.seed.json"),
    "utf8",
  )) as { information?: BootstrapInformation[] };
  return store.information ?? [];
}

test("bootstrap roadside keeps X post, quoted post, paragraphs, and chapters readable", async () => {
  const information = await bootstrapInformation();
  const item = information.find((candidate) => (
    candidate.originContentId === "x:status:2082974353868923021"
  ));

  assert.ok(item, "the verified Jeff Dean roadside record must remain in the launch baseline");
  for (const content of [item.originalContent, item.translatedContent]) {
    assert.match(
      content ?? "",
      /basketball arena!\n{2,}Y Combinator @ycombinator\n{2,}In 2001,/,
      "the root post and quoted post must not be concatenated",
    );
    assert.match(
      content ?? "",
      /can still win\.\n{2,}00:07[^\n]+\n01:44[^\n]+/,
      "video chapters must remain one entry per line",
    );
  }
});

test("bootstrap keeps structure across X quotes, release lists, and long articles", async () => {
  const information = await bootstrapInformation();
  const bySlug = new Map(information.map((item) => [item.slug, item]));

  const xQuote = bySlug.get("open-wiki-is-long-term-memory-for-your-codebase-de6b2c2d");
  assert.match(xQuote?.translatedContent ?? "", /codebase\n{2,}Colin Francis @colifran_\n{2,}/);

  const gitea = bySlug.get("go-gitea-gitea-发布-v1-27-1-0c63421b");
  assert.match(gitea?.originalContent ?? "", /^\* SECURITY\n {2}\* fix/m);
  assert.match(gitea?.translatedContent ?? "", /^- 安全：[^\n]+\n- API：/m);

  const sglang = bySlug.get("sgl-project-sglang-发布-v0-5-15-post1-b14c08d2");
  assert.match(sglang?.translatedContent ?? "", /GLM 5\.2\n- #30454[^\n]+\n- #30858/);

  const anthropic = bySlug.get("anthropic-再次向-public-first-action-捐赠-2000-万美元-b45dcfcc");
  assert.match(anthropic?.translatedContent ?? "", /\n{2,}为什么是现在？\n{2,}AI 模型/);
  assert.match(anthropic?.translatedContent ?? "", /\n{2,}符合时宜的政策\n{2,}/);
});
