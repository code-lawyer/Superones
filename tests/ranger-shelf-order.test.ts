import assert from "node:assert/strict";
import test from "node:test";
import type { RangerProfile } from "../lib/opc-catalog.ts";
import { buildRangerShelfEntries } from "../lib/ranger-shelf-order.ts";

function ranger(slug: string, publicName: string, identity: string): RangerProfile {
  return {
    slug,
    publicName,
    identity,
    intro: `${publicName}介绍`,
    tags: ["专业能力"],
    contactLabel: `${slug}@example.com`,
    contactState: "EMAIL / PUBLIC",
  };
}

test("ranger shelf preserves published catalog order before vacant identity slots", () => {
  const profiles = [
    ranger("he-keqin", "KK（何珂沁）", "自媒体专家"),
    ranger("chen-yushi", "陈钰什", "创业顾问"),
    ranger("wang-jiaxi", "王佳浠", "设计师"),
    ranger("dong-wenguo", "董文国", "知识产权顾问"),
  ];

  const entries = buildRangerShelfEntries(profiles);

  assert.deepEqual(
    entries.slice(0, profiles.length).map((entry) => entry.profile?.slug),
    profiles.map((profile) => profile.slug),
  );
  assert.ok(entries.slice(profiles.length).every((entry) => entry.profile === null));
  assert.equal(entries.length, 10);
});

test("ranger shelf keeps multiple profiles in the same identity in catalog order", () => {
  const profiles = [
    ranger("first-founder", "第一位", "创业顾问"),
    ranger("second-founder", "第二位", "创业顾问"),
  ];

  const entries = buildRangerShelfEntries(profiles);

  assert.deepEqual(entries.slice(0, 2).map((entry) => entry.profile?.slug), ["first-founder", "second-founder"]);
  assert.equal(entries.filter((entry) => entry.identity === "创业顾问" && entry.profile === null).length, 0);
  assert.equal(entries.length, 11);
});
