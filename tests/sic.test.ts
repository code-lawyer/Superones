import assert from "node:assert/strict";
import test from "node:test";
import { createGithubBoards } from "../lib/sic.ts";
import { weeklyHuggingFaceGrowth } from "../lib/sic-snapshots.ts";
import type { TrendProject } from "../lib/types.ts";

function project(owner: string, repo: string, rank: number, delta24: number, delta7: number, stars: number): TrendProject {
  return { owner, repo, rank, delta24, delta7, stars, change: "—", category: "Agent", description: "说明", language: "TypeScript", license: "MIT", updated: "现在", captured: "现在", fit: "说明" };
}

test("SiC keeps GitHub official, 24H, and 7D boards as independent orderings", () => {
  const boards = createGithubBoards([
    project("first", "alpha", 2, 30, 5, 900),
    project("second", "beta", 1, 10, 80, 100),
    project("third", "gamma", 3, 50, 20, 700),
  ]);

  assert.deepEqual(boards.map((board) => board.id), ["github-trending", "github-24h", "github-7d"]);
  assert.deepEqual(boards[0].items.map((item) => item.name), ["second/beta", "first/alpha", "third/gamma"]);
  assert.deepEqual(boards[0].items.map((item) => item.value), [100, 900, 700]);
  assert.deepEqual(boards[1].items.map((item) => item.name), ["third/gamma", "first/alpha", "second/beta"]);
  assert.deepEqual(boards[2].items.map((item) => item.name), ["second/beta", "third/gamma", "first/alpha"]);
});

test("Hugging Face weekly growth only compares models present in both official snapshots", () => {
  const result = weeklyHuggingFaceGrowth(
    [
      { id: "stable-a", name: "org/a", downloadsAllTime: 120 },
      { id: "new-b", name: "org/b", downloadsAllTime: 40 },
      { id: "stable-c", name: "org/c", downloadsAllTime: 90 },
    ],
    [
      { id: "stable-a", name: "org/a", downloadsAllTime: 70 },
      { id: "stable-c", name: "org/c", downloadsAllTime: 100 },
    ],
  );

  assert.deepEqual(result.map(({ name, value }) => ({ name, value })), [
    { name: "org/a", value: 50 },
    { name: "org/c", value: 0 },
  ]);
});
