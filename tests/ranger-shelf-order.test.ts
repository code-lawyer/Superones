import assert from "node:assert/strict";
import test from "node:test";
import { defaultRangerIdentities, type RangerIdentity, type RangerProfile } from "../lib/opc-catalog.ts";
import { buildRangerShelfEntries } from "../lib/ranger-shelf-order.ts";

function ranger(slug: string, publicName: string, identityId: string): RangerProfile {
  return {
    slug,
    publicName,
    identityId,
    intro: `${publicName}介绍`,
    tags: ["专业能力"],
    contactLabel: `${slug}@example.com`,
    contactState: "EMAIL / PUBLIC",
  };
}

test("ranger shelf preserves published catalog order before vacant identity slots", () => {
  const profiles = [
    ranger("he-keqin", "KK（何珂沁）", "media-expert"),
    ranger("chen-yushi", "陈钰什", "startup-advisor"),
    ranger("wang-jiaxi", "王佳浠", "designer"),
    ranger("dong-wenguo", "董文国", "intellectual-property-advisor"),
  ];

  const entries = buildRangerShelfEntries(profiles, defaultRangerIdentities);

  assert.deepEqual(
    entries.slice(0, profiles.length).map((entry) => entry.profile?.slug),
    profiles.map((profile) => profile.slug),
  );
  assert.ok(entries.slice(profiles.length).every((entry) => entry.profile === null));
  assert.equal(entries.length, 10);
});

test("ranger shelf keeps multiple profiles in the same identity in catalog order", () => {
  const profiles = [
    ranger("first-founder", "第一位", "startup-advisor"),
    ranger("second-founder", "第二位", "startup-advisor"),
  ];

  const entries = buildRangerShelfEntries(profiles, defaultRangerIdentities);

  assert.deepEqual(entries.slice(0, 2).map((entry) => entry.profile?.slug), ["first-founder", "second-founder"]);
  assert.equal(entries.filter((entry) => entry.identity.name === "创业顾问" && entry.profile === null).length, 0);
  assert.equal(entries.length, 11);
});

test("ranger shelf uses the published identity set and its order for vacant slots", () => {
  const identities: RangerIdentity[] = [
    { id: "security-advisor", name: "安全顾问" },
    { id: "growth-advisor", name: "增长顾问" },
  ];
  const profiles = [ranger("security-one", "安全一号", "security-advisor")];

  const entries = buildRangerShelfEntries(profiles, identities);

  assert.equal(entries[0].identity.name, "安全顾问");
  assert.equal(entries[0].profile?.slug, "security-one");
  assert.deepEqual(entries.slice(1).map((entry) => entry.identity.name), ["增长顾问"]);
});
