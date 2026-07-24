import assert from "node:assert/strict";
import test from "node:test";
import {
  parseGithubTrending,
  parseHuggingFaceTrending,
  parseOpenRouterWeekly,
  parseSkillsRanking,
} from "../lib/direct-rankings.ts";

const capturedAt = "2026-07-24T08:00:00.000Z";

test("GitHub parser preserves official order and period metric", () => {
  const html = `
    <article class="Box-row"><h2><a href="/alpha/one">alpha / one</a></h2><p class="col-9">First</p><span>42 stars today</span></article>
    <article class="Box-row"><h2><a href="/beta/two">beta / two</a></h2><p class="col-9">Second</p><span>7 stars today</span></article>
  `;
  const values = parseGithubTrending(html, {
    capturedAt,
    providerView: "today",
    sourceUrl: "https://github.com/trending?since=daily",
  });
  assert.deepEqual(values.map((value) => ({
    name: value.name,
    rank: value.providerRank,
    metric: value.value,
  })), [
    { name: "alpha/one", rank: 1, metric: 42 },
    { name: "beta/two", rank: 2, metric: 7 },
  ]);
});

test("model parsers keep official array order without calculating deltas", () => {
  const huggingFace = parseHuggingFaceTrending([
    { id: "org/model-b" },
    { id: "org/model-a" },
  ], { capturedAt, sourceUrl: "https://huggingface.co/models?sort=trending" });
  const openRouter = parseOpenRouterWeekly({
    data: [
      { id: "vendor/model-z", name: "Model Z" },
      { id: "vendor/model-x", name: "Model X" },
    ],
  }, { capturedAt, sourceUrl: "https://openrouter.ai/api/v1/models?sort=top-weekly" });
  assert.deepEqual(huggingFace.map((value) => value.providerRank), [1, 2]);
  assert.deepEqual(openRouter.map((value) => value.name), ["Model Z", "Model X"]);
  assert.ok([...huggingFace, ...openRouter].every((value) => value.value === null));
});

test("skills parser uses the platform rank and displayed metric", () => {
  const html = `
    <a href="/owner/repo/alpha"><span>1 alpha owner/repo 12.4K</span></a>
    <a href="/owner/repo/beta"><span>2 beta owner/repo 900</span></a>
  `;
  const values = parseSkillsRanking(html, {
    capturedAt,
    providerView: "all-time",
    sourceUrl: "https://www.skills.sh/",
  });
  assert.deepEqual(values.map((value) => ({
    rank: value.providerRank,
    value: value.value,
  })), [
    { rank: 1, value: 12_400 },
    { rank: 2, value: 900 },
  ]);
});
