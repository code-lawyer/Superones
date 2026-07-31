import assert from "node:assert/strict";
import test from "node:test";
import { buildBootstrapManifest } from "../scripts/bootstrap-manifest.ts";

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
