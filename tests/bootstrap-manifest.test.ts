import assert from "node:assert/strict";
import test from "node:test";
import { buildBootstrapManifest, mergeBootstrapContentSeed } from "../scripts/bootstrap-manifest.ts";

test("bootstrap manifest hashes every seed and derives counts from its payloads", () => {
  const files = {
    "content-store.seed.json": `${JSON.stringify({
      information: [
        { contentGroup: "information" },
        { contentGroup: "roadside" },
      ],
      events: [{ slug: "event" }],
    })}\n`,
    "sic-content-store.seed.json": `${JSON.stringify({ items: [{ slug: "document" }] })}\n`,
    "direct-rankings.seed.json": `${JSON.stringify({
      boards: [{ items: [{ id: "one" }, { id: "two" }] }],
    })}\n`,
  };
  const manifest = buildBootstrapManifest(files, ".collector-output/runs/example", "2026-07-31T00:00:00.000Z");
  assert.deepEqual(manifest.counts, {
    information: 1,
    roadside: 1,
    events: 1,
    sic: 1,
    rankingBoards: 1,
    rankingItems: 2,
  });
  assert.equal(manifest.files["content-store.seed.json"].bytes, Buffer.byteLength(files["content-store.seed.json"]));
  assert.match(manifest.files["content-store.seed.json"].sha256, /^[a-f0-9]{64}$/);
});

test("bootstrap import preserves newer production content and only adds missing seed records", () => {
  const project = (owner: string, repo: string, description: string) => ({
    owner, repo, description, rank: 1, change: "new", category: "AI", language: "TypeScript",
    stars: 1, delta24: 1, delta7: 1, license: "MIT", updated: "2026-07-31", captured: "2026-07-31", fit: "high",
  });
  const current = {
    updatedAt: "2026-07-31T12:00:00.000Z",
    sourceCount: 9,
    events: [{ slug: "live" }] as never[],
    information: [{ slug: "live" }] as never[],
    projects: [project("owner", "repo", "production")],
  };
  const seed = {
    updatedAt: "2026-07-30T12:00:00.000Z",
    sourceCount: 5,
    events: [{ slug: "seed" }] as never[],
    information: [{ slug: "seed" }] as never[],
    projects: [project("OWNER", "REPO", "seed"), project("new", "repo", "seed-only")],
  };

  const merged = mergeBootstrapContentSeed(current, seed);
  assert.equal(merged.updatedAt, current.updatedAt);
  assert.equal(merged.sourceCount, 9);
  assert.deepEqual(merged.events.map(({ slug }) => slug), ["live", "seed"]);
  assert.deepEqual(merged.information.map(({ slug }) => slug), ["live", "seed"]);
  assert.deepEqual(merged.projects.map(({ description }) => description), ["production", "seed-only"]);
});
