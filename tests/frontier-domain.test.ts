import assert from "node:assert/strict";
import test from "node:test";
import { drawRandomPrizes, nextSeason, rankSubmissions, seasonForDate } from "../lib/frontier-domain.ts";

test("natural-quarter seasons switch at Beijing midnight", () => {
  const summer = seasonForDate(new Date("2026-06-30T15:59:59.999Z"));
  const autumn = seasonForDate(new Date("2026-06-30T16:00:00.000Z"));
  assert.equal(summer.code, "2026-Q2");
  assert.equal(summer.name, "2026 夏季赛");
  assert.equal(autumn.code, "2026-Q3");
  assert.equal(autumn.name, "2026 秋季赛");
  assert.equal(autumn.endsAt, "2026-09-30T15:59:59.999Z");
});

test("next season crosses the year boundary", () => {
  assert.equal(nextSeason("2026-Q4").code, "2027-Q1");
  assert.equal(nextSeason("2026-Q2").code, "2026-Q3");
});

test("ranking keeps negative growth and applies stable tie breakers", () => {
  const ranked = rankSubmissions([
    { id: "late", repository: "b/repo", description: "B", baseline: 20, current: 18, verifiedAt: "2026-07-02T00:00:00.000Z" },
    { id: "early", repository: "a/repo", description: "A", baseline: 10, current: 8, verifiedAt: "2026-07-01T00:00:00.000Z" },
    { id: "winner", repository: "c/repo", description: "C", baseline: 4, current: 12, verifiedAt: "2026-07-03T00:00:00.000Z" },
  ]);
  assert.deepEqual(ranked.map((item) => [item.id, item.delta, item.rank]), [
    ["winner", 8, 1],
    ["late", -2, 2],
    ["early", -2, 3],
  ]);
});

test("random pool follows ranking order and awards at most one prize per repository", () => {
  const ranked = rankSubmissions([
    { id: "one", repository: "a/one", description: "A", baseline: 0, current: 9, verifiedAt: "2026-07-01T00:00:00.000Z" },
    { id: "two", repository: "b/two", description: "B", baseline: 0, current: 4, verifiedAt: "2026-07-02T00:00:00.000Z" },
  ]);
  const draw = drawRandomPrizes(ranked, ["p1", "p2", "p3"], (upperExclusive) => upperExclusive - 1);
  assert.deepEqual(draw.assignments, [
    { submissionId: "one", prizeDonationId: "p3", drawOrder: 1 },
    { submissionId: "two", prizeDonationId: "p2", drawOrder: 2 },
  ]);
  assert.deepEqual(draw.remainingPrizeDonationIds, ["p1"]);
});

test("empty random pool still allows a season to settle", () => {
  const draw = drawRandomPrizes([], [], () => 0);
  assert.deepEqual(draw, { assignments: [], remainingPrizeDonationIds: [] });
});
