import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { compileXSourcePolicy, normalizeXHandle } from "../scripts/x-source-policy.mjs";

const policyInput = JSON.parse(await readFile(new URL("../config/x-source-policy.json", import.meta.url), "utf8"));
const registry = JSON.parse(await readFile(new URL("../config/source-registry.json", import.meta.url), "utf8"));
const bundle = JSON.parse(await readFile(new URL("../config/source-bundle.json", import.meta.url), "utf8"));
const followBuilders = JSON.parse(await readFile(new URL("../config/follow-builders-source-registry.json", import.meta.url), "utf8"));

test("X policy is fail-closed, explicit, and contains no duplicate handles", () => {
  const policy = compileXSourcePolicy(policyInput);
  const registered = new Set(
    registry.channels
      .filter((source: { channelType: string }) => source.channelType === "x")
      .map((source: { channelIdentifier: string }) => normalizeXHandle(source.channelIdentifier)),
  );

  assert.equal(policy.defaultStatus, "excluded");
  assert.equal(policy.accounts.size, 34);
  assert.ok([...policy.accounts.keys()].every((handle) => registered.has(handle)));
});

test("runtime X stream keeps direct policy sources plus one trusted Follow Builders feed", () => {
  const policy = compileXSourcePolicy(policyInput);
  const statements = bundle.sources.filter((source: { sourceStream: string; originPlatform: string }) => source.sourceStream === "roadside" && source.originPlatform === "x");
  const direct = statements.filter((source: { connector: string }) => source.connector !== "follow-builders-x");
  const trustedFeed = statements.filter((source: { connector: string }) => source.connector === "follow-builders-x");
  const handles = direct.map((source: { channelIdentifier: string }) => normalizeXHandle(source.channelIdentifier));

  assert.equal(statements.length, 35);
  assert.equal(new Set(handles).size, direct.length);
  assert.ok(handles.every((handle: string) => policy.accounts.has(handle)));
  assert.equal(trustedFeed.length, 1);
  assert.equal(trustedFeed[0].id, "source-follow-builders-x");
  assert.equal(trustedFeed[0].ownerEntity, "aggregator:follow-builders");
  assert.equal(trustedFeed[0].publisherKind, "aggregator");
  assert.ok(statements.every((source: { originPlatform: string }) => source.originPlatform === "x"));
  assert.ok(statements.every((source: { classificationConfidence: string }) => source.classificationConfidence === "high"));
  assert.ok(statements
    .filter((source: { connector: string }) => source.connector === "follow-builders-x")
    .every((source: { failureMode: string }) => source.failureMode === "isolated"));
});

test("X cleanup accounting distinguishes candidates, removals, and merged directory declarations", () => {
  assert.equal(bundle.counts.xCandidates, 179);
  assert.equal(bundle.counts.xRunnableCandidates, 160);
  assert.equal(bundle.counts.statements, 35);
  assert.equal(bundle.counts.roadside, 36);
  assert.equal(bundle.counts.followBuildersX, 1);
  assert.equal(bundle.counts.followBuildersXDuplicates, 0);
  assert.equal(bundle.counts.followBuildersXExcluded, 0);
  assert.equal(bundle.counts.xExcludedFromRuntime, 126);
  assert.equal(bundle.counts.xDuplicateDiscoveriesMerged, 9);
});

test("Follow Builders feeds trust upstream selection and retain only protocol safety bounds", () => {
  assert.equal(followBuilders.failureMode, "isolated");
  assert.equal(followBuilders.version, 2);
  assert.match(followBuilders.trustPolicy, /no local source admission/i);
  assert.equal(followBuilders.feeds.x.maxAccounts, 100);
  assert.equal(followBuilders.feeds.x.maxItemsPerAccount, 20);
  assert.equal(followBuilders.feeds.x.maxItemsPerFeed, 2000);
  assert.equal(followBuilders.accounts, undefined);
  assert.ok(bundle.sources.every((source: { name: string }) => !["Hacker News", "Lobsters"].includes(source.name)));
});
