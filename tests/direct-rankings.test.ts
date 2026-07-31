import assert from "node:assert/strict";
import test from "node:test";
import {
  parseHuggingFaceTrending,
  parseOpenGithubRankReadme,
  parseOpenRouterWeekly,
} from "../lib/direct-rankings.ts";

const capturedAt = "2026-07-24T08:00:00.000Z";

test("OpenGithubs API parser preserves rank order and star growth", () => {
  const markdown = `
| 排名 | 项目名 | Star | 今日增长 |
| --- | --- | --- | --- |
| 1 | [alpha/one](https://github.com/alpha/one) | 12.4k | 🔺42 |
| 2 | [beta/two](https://github.com/beta/two) | 900 | 🔺7 |
  `;
  const values = parseOpenGithubRankReadme({
    encoding: "base64",
    content: Buffer.from(markdown).toString("base64"),
  }, {
    capturedAt,
    providerView: "today",
    sourceUrl: "https://github.com/OpenGithubs/github-daily-rank",
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
