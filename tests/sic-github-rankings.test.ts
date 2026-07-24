import assert from "node:assert/strict";
import test from "node:test";
import { sicGithubRankingTestUtils } from "../lib/sic-github-rankings.ts";

test("SiC official Trending mirror preserves upstream order and repository identity", () => {
  const candidates = sicGithubRankingTestUtils.trendingCandidates({
    items: [
      { title: "alpha/first", url: "https://github.com/alpha/first", stars: 100 },
      { title: "beta/second", url: "https://github.com/beta/second", stars: 90 },
    ],
  });
  assert.deepEqual(candidates, [
    { owner: "alpha", repo: "first", stars: 100 },
    { owner: "beta", repo: "second", stars: 90 },
  ]);
});

test("SiC GitHub identity parser rejects non-repository strings", () => {
  assert.equal(sicGithubRankingTestUtils.repositoryName("not a repository"), null);
  assert.deepEqual(sicGithubRankingTestUtils.repositoryName("owner/repo"), { owner: "owner", repo: "repo" });
});

test("SiC repository introduction reads README text and remains concise", () => {
  const readme = Buffer.from("# Project\n\n[![build](https://example.com/badge)](https://example.com)\n\nA durable workflow runtime that preserves checkpoints across long-running tool calls.").toString("base64");
  const intro = sicGithubRankingTestUtils.readmeIntro(readme);
  assert.ok(intro.includes("durable workflow runtime"));
  assert.ok(intro.length <= 200);
});
