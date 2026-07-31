import assert from "node:assert/strict";
import test from "node:test";
import { decodeFeedSlug, eventHref, informationHref, matchesFeedSlug } from "../lib/feed-route.ts";

test("information routes encode and recover Unicode slugs", () => {
  const slug = "diegosouzapw-omniroute-9-过去24小时-c272d27b";
  const href = informationHref(slug);
  const segment = href.split("/").at(-1)!;
  assert.match(segment, /%E8%BF%87/);
  assert.equal(decodeFeedSlug(segment), slug);
  assert.equal(matchesFeedSlug(slug, segment), true);
});

test("event routes encode Unicode slugs through the shared route contract", () => {
  const slug = "gpt-5-6发布并进入微软copilot-54e4cbec";
  const href = eventHref(slug);
  const segment = href.split("/").at(-1)!;
  assert.match(segment, /%E5%8F%91%E5%B8%83/);
  assert.equal(matchesFeedSlug(slug, segment), true);
});

test("malformed route encoding is handled without throwing", () => {
  assert.equal(decodeFeedSlug("broken%slug"), "broken%slug");
  assert.equal(matchesFeedSlug("broken%slug", "broken%slug"), true);
});
